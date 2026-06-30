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
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        # Restrict to this repo. Tighten further to a branch/environment with
        # e.g. "repo:${var.github_repo}:ref:refs/heads/main".
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })
}

# Broad permissions for personal use. Scope down once things settle.
resource "aws_iam_role_policy_attachment" "ci_poweruser" {
  role       = aws_iam_role.ci.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# PowerUserAccess excludes IAM. The main config manages a key pair + reads SSM
# but does not create IAM, so this is enough. If you later manage IAM in CI,
# attach IAMFullAccess (or a scoped policy) here.

output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "role_arn" {
  value = aws_iam_role.ci.arn
}
