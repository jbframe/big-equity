terraform {
  required_version = ">= 1.10" # use_lockfile (S3-native locking) needs >= 1.10

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
