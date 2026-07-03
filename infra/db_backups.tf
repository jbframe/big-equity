# simulationDB backups (ADR-003): a private S3 bucket the box dumps into
# weekly (cron in user_data.sh.tftpl), plus the instance role that lets it
# write there. Restore path is proven per ADR-004 before real data lands.

resource "aws_s3_bucket" "db_backups" {
  bucket = var.backup_bucket_name
}

# Dumps are only worth keeping for the data-loss window; expire them so the
# bucket never accumulates cost. Tightening the cadence is a cron change on
# the box, not a bucket change.
resource "aws_s3_bucket_lifecycle_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id

  rule {
    id     = "expire-old-dumps"
    status = "Enabled"

    filter {
      prefix = "simulationdb/"
    }

    expiration {
      days = 30
    }

    # The cron streams dumps in (`aws s3 cp -`), which uses multipart uploads;
    # a failed run would otherwise leave invisible, billed parts behind.
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # Same policy for FusionAuth's database dumps (ADR-006) — the cron dumps
  # both databases, each to its own prefix.
  rule {
    id     = "expire-old-fusionauth-dumps"
    status = "Enabled"

    filter {
      prefix = "fusionauth/"
    }

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "db_backups" {
  bucket                  = aws_s3_bucket.db_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Instance role ----------------------------------------------------------
# First IAM identity for the box itself (deploys use SSH, not AWS APIs, so it
# never needed one before). Write-only on the backup prefix: the box can drop
# dumps but not read or delete them, so a compromised box can't destroy the
# backups it exists to protect.

resource "aws_iam_role" "app" {
  name = "${var.project_name}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "db_backups" {
  name = "db-backups"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "PutDumps"
      Effect = "Allow"
      Action = "s3:PutObject"
      # One prefix per database the backup cron dumps (ADR-003, ADR-006) —
      # still write-only: the box can drop dumps but not read or delete them.
      Resource = [
        "${aws_s3_bucket.db_backups.arn}/simulationdb/*",
        "${aws_s3_bucket.db_backups.arn}/fusionauth/*",
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "app" {
  name = "${var.project_name}-instance"
  role = aws_iam_role.app.name
}
