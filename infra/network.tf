# 기본 VPC 사용 (공부용으로 비용·복잡도 최소화)
data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "server" {
  name        = "${var.project}-server-sg"
  description = "Promeet API server"
  vpc_id      = data.aws_vpc.default.id

  # SG 설명에는 영문만 가능
  ingress {
    description = "HTTP for Lets Encrypt and HTTPS redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 22(SSH)는 열지 않음 -> 서버 접속은 SSM Session Manager로
  # 3001/3002(앱 컨테이너)도 열지 않음 -> Nginx만 localhost로 접근

  egress {
    description = "All outbound (ECR, MongoDB Atlas, apt)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
