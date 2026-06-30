terraform {
  backend "s3" {
    # NOTE: backend config can't use variables. Edit these literals to match
    # the bucket created by infra/bootstrap, or pass them via -backend-config.
    bucket       = "big-equity-tfstate-jbframe"
    key          = "app/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true # S3-native state locking (Terraform >= 1.10); no DynamoDB needed
  }
}
