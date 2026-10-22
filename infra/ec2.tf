# Ubuntu 24.04 ARM 최신 AMI (SSM Agent 기본 설치됨)
data "aws_ssm_parameter" "ubuntu_ami" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}

resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.ubuntu_ami.insecure_value
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    domain = var.domain
  })

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required" # IMDSv2 강제 (보안)
  }

  tags = {
    Name = "${var.project}-server"
  }

  lifecycle {
    # AMI가 새로 나와도 서버를 재생성하지 않음
    ignore_changes = [ami, user_data]
  }
}

# 고정 IP -> DuckDNS에 이 IP 등록
resource "aws_eip" "server" {
  instance = aws_instance.server.id
  domain   = "vpc"

  tags = {
    Name = "${var.project}-eip"
  }
}
