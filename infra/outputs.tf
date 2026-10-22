output "server_public_ip" {
  description = "DuckDNS current ip에 넣을 고정 IP / Atlas Network Access에 추가할 IP"
  value       = aws_eip.server.public_ip
}

output "instance_id" {
  value = aws_instance.server.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "deploy_bucket" {
  value = aws_s3_bucket.deploy.bucket
}

output "github_actions_role_arn" {
  description = "GitHub Variables의 AWS_ROLE_ARN에 넣을 값"
  value       = aws_iam_role.github_actions.arn
}
