variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "project" {
  type    = string
  default = "promeet"
}

variable "instance_type" {
  description = "ARM(Graviton) 인스턴스. 메모리가 부족하면 t4g.small로 변경"
  type        = string
  default     = "t4g.micro"
}

variable "domain" {
  description = "API 도메인 (DuckDNS)"
  type        = string
  default     = "promeet-api.duckdns.org"
}

variable "github_repo" {
  description = "배포 권한을 줄 GitHub 레포 (owner/repo)"
  type        = string
  default     = "duwlsssss/Promeet-Server"
}

variable "github_branch" {
  type    = string
  default = "main"
}

variable "budget_limit_usd" {
  description = "월 예산(USD). 실제 비용이 이 금액에 도달하면 EC2 자동 중지"
  type        = number
  default     = 20
}

variable "alert_email" {
  description = "예산 알림을 받을 이메일 (terraform.tfvars에 설정)"
  type        = string
}
