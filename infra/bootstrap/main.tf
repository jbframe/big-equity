# ---------------------------------------------------------------------------
# Bootstrap — run ONCE, locally, with local state.
#
# Creates the prerequisites that the CI pipeline needs but cannot create for
# itself (chicken-and-egg):
#   * S3 bucket for the main config's remote state
#   * GitHub OIDC identity provider
#   * IAM role that GitHub Actions assumes (no long-lived AWS keys)
#
#   cd infra/bootstrap && terraform init && terraform apply
#
# Then copy the outputs:
#   - state_bucket -> infra/backend.tf  (bucket = ...)
#   - role_arn     -> GitHub variable AWS_ROLE_ARN
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "github_repo" {
  description = "GitHub repo allowed to assume the role, as owner/repo."
  type        = string
  default     = "YOURUSER/big-equity"
}

variable "state_bucket_name" {
  description = "Globally-unique name for the Terraform state bucket."
  type        = string
  default     = "big-equity-tfstate-CHANGEME"
}

# --- Remote state bucket ---------------------------------------------------
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- GitHub OIDC provider --------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS now validates GitHub's cert chain natively; this value is required by
  # the API but effectively ignored.
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]
}

# --- Role that GitHub Actions assumes via OIDC -----------------------------
resource "aws_iam_role" "ci" {
  name = "github-actions-terraform"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        # Scope the role to exactly one caller: a run of the terraform pipeline
        # that is gated by the "production" GitHub environment. Because that job
        # declares `environment: production` (.github/workflows/infra.yml), its
        # OIDC token `sub` is the environment form below — NOT a `ref:` form.
        # A push/PR on any other branch produces a different `sub`, so AWS STS
        # refuses the assume outright (enforced by AWS, independent of GitHub
        # branch protection).
        #
        # COUPLING: this must stay in sync with infra.yml. If you remove
        # `environment: production` from that workflow, the `sub` reverts to
        # `repo:${var.github_repo}:ref:refs/heads/main` and apply breaks until
        # this value is updated to match.
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:environment:production"
        }
      }
    }]
  })
}

# Least-privilege policy for the CI role: exactly what the main config
# (../main.tf) manages and nothing more. This is the permission half of the
# defense-in-depth pair — the trust policy above limits WHO can assume the
# role; this limits WHAT the role can do once assumed.
#
# Local runs are unaffected: `terraform apply` from your machine uses your own
# AWS identity (the default credential chain), not this role — so scoping it
# down does not touch local bootstrap.
#
# Note: most EC2 RunInstances/Describe* actions don't support resource-level
# scoping, so "ec2:*" on "*" is the practical floor — still far narrower than
# PowerUserAccess (no S3 beyond state, no IAM, RDS, Lambda, Secrets Manager).
# If you later manage IAM in CI, add a scoped iam:* statement here.
resource "aws_iam_role_policy" "ci" {
  name = "github-actions-terraform"
  role = aws_iam_role.ci.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EC2"
        Effect   = "Allow"
        Action   = "ec2:*"
        Resource = "*"
      },
      {
        Sid      = "SSMReadPublicAMI"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:aws:ssm:*::parameter/aws/service/ami-amazon-linux-latest/*"
      },
      {
        Sid      = "TFStateBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketVersioning"]
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid      = "TFStateObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.state.arn}/*"
      }
    ]
  })
}

output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "role_arn" {
  value = aws_iam_role.ci.arn
}
