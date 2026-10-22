terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # 상태 파일(tfstate)을 S3에 저장. bucket 이름은 init 때 -backend-config로 넘김
  backend "s3" {
    key          = "promeet/terraform.tfstate"
    region       = "ap-northeast-2"
    use_lockfile = true # S3 자체 잠금 (DynamoDB 불필요)
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
