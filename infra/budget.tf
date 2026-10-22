############################
# 월 예산 + 알림
############################
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # 실제 비용 80% 도달 시 메일
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  # 월말 예상 비용이 예산을 넘을 것 같을 때 메일
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

############################
# 예산 초과 시 EC2 자동 중지 (Budget Action)
############################
# Budgets 서비스가 EC2를 중지할 수 있게 하는 역할
resource "aws_iam_role" "budget_action" {
  name = "${var.project}-budget-action"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "budgets.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# AWS 제공 정책: SSM 자동화로 EC2/RDS 중지
resource "aws_iam_role_policy_attachment" "budget_action" {
  role       = aws_iam_role.budget_action.name
  policy_arn = "arn:aws:iam::aws:policy/AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM"
}

resource "aws_budgets_budget_action" "stop_ec2" {
  budget_name        = aws_budgets_budget.monthly.name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC" # 승인 없이 바로 실행
  notification_type  = "ACTUAL"    # 예상치가 아니라 실제 비용 기준
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_EC2_INSTANCES"
      region          = var.region
      # EC2를 다시 만들면 새 ID로 자동 갱신됨
      instance_ids = [aws_instance.server.id]
    }
  }

  subscriber {
    address           = var.alert_email
    subscription_type = "EMAIL"
  }

  depends_on = [aws_iam_role_policy_attachment.budget_action]
}
