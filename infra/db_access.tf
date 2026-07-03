# Dev-only public access toggle for simulationDB (ADR-005). The manual
# GitHub workflow .github/workflows/db-access.yml assumes this role via OIDC
# to open/close 5432 on the instance security group — no long-lived AWS keys.
# The SG rule it creates lives outside Terraform, so a `terraform apply`
# while access is enabled reverts it — which fails closed, the safe state.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  # Created once by infra/bootstrap; referenced by constructed ARN so the CI
  # role needs no IAM read permissions to plan this file.
  github_oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

resource "aws_iam_role" "db_access" {
  name = "${var.project_name}-db-access"

  # Scoped to this repo's main branch. GitHub's default OIDC `sub` can't name
  # a single workflow file — narrowing further would mean customizing the sub
  # claim repo-side. Acceptable: the permissions below only open/close one
  # port on one SG, and the nightly failsafe closes it.
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.github_oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "db_access" {
  name = "sg-toggle"
  role = aws_iam_role.db_access.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ToggleIngress"
        Effect = "Allow"
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress"
        ]
        Resource = "arn:aws:ec2:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:security-group/${aws_security_group.app.id}"
      },
      {
        # The disable path lists existing 5432 rules before revoking them;
        # Describe* actions don't support resource-level scoping.
        Sid      = "ReadRules"
        Effect   = "Allow"
        Action   = "ec2:DescribeSecurityGroups"
        Resource = "*"
      }
    ]
  })
}
