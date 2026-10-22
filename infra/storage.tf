############################
# ECR: Docker 이미지 저장소
############################
resource "aws_ecr_repository" "app" {
  name                 = "${var.project}-server"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # destroy 시 이미지가 있어도 삭제

  image_scanning_configuration {
    scan_on_push = true
  }
}

# 최근 이미지 10개만 보관 (저장 비용 절감, 롤백용으로 충분)
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

############################
# S3: 배포 스크립트 전달용 버킷
############################
resource "aws_s3_bucket" "deploy" {
  bucket        = "${var.project}-deploy-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "deploy" {
  bucket                  = aws_s3_bucket.deploy.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
