# Promeet-Server AWS 배포 가이드

구성: **EC2(t4g.micro) + Nginx 블루/그린 + Docker + ECR + S3 + GitHub Actions(OIDC)**, DB는 MongoDB Atlas

```
사용자 ─https─▶ Nginx(80/443) ─▶ blue:3001 또는 green:3002 (Docker)
                                         └▶ MongoDB Atlas
GitHub push ─▶ Actions: 이미지 빌드 → ECR 푸시 → S3에 deploy.sh → SSM으로 EC2에서 실행
```

## 0. 집 PC 준비 (최초 1회)

1. 설치: [AWS CLI v2](https://docs.aws.amazon.com/ko_kr/cli/latest/userguide/getting-started-install.html), [Terraform](https://developer.hashicorp.com/terraform/install) (1.10 이상)
2. 액세스 키 발급: 콘솔 → IAM → 사용자 → `yeojin-admin` → 보안 자격 증명 → **액세스 키 만들기** → 사용 사례 "CLI"
3. 등록
   ```bash
   aws configure
   # Access Key / Secret Key 입력, region: ap-northeast-2, output: json
   aws sts get-caller-identity   # 계정 ID가 나오면 성공
   ```

## 1. Terraform 상태 저장 버킷 만들기 (최초 1회)

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3api create-bucket --bucket promeet-tfstate-$ACCOUNT_ID \
  --region ap-northeast-2 --create-bucket-configuration LocationConstraint=ap-northeast-2
aws s3api put-bucket-versioning --bucket promeet-tfstate-$ACCOUNT_ID \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket promeet-tfstate-$ACCOUNT_ID \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 2. 인프라 생성

```bash
cd infra
terraform init -backend-config="bucket=promeet-tfstate-$ACCOUNT_ID"
terraform plan    # 생성될 리소스 확인
terraform apply   # yes 입력
```

끝나면 출력값이 나와요 (`terraform output`으로 다시 볼 수 있음).

## 3. 출력값 등록

| 출력값 | 어디에 |
|---|---|
| `server_public_ip` | DuckDNS `promeet-api`의 current ip → update ip |
| `server_public_ip` | Atlas → Network Access → Add IP Address |
| `github_actions_role_arn` | GitHub → Settings → Secrets and variables → Actions → **Variables** → `AWS_ROLE_ARN` |

## 4. 첫 배포

1. EC2 초기 설치(user_data)가 끝날 때까지 **3~5분** 기다려요.
2. 이 브랜치를 main에 머지하면 Actions가 자동 배포해요. (Actions 탭 → Deploy to EC2 → Run workflow로 수동 실행도 가능)
3. 확인: `curl http://promeet-api.duckdns.org/health` → `{"status":"ok"}`

## 5. HTTPS 설정 (최초 1회)

콘솔 → EC2 → 인스턴스 `promeet-server` 선택 → **연결 → Session Manager → 연결**, 열린 터미널에서:

```bash
sudo certbot --nginx -d promeet-api.duckdns.org --agree-tos -m 본인이메일 --redirect --non-interactive
sudo certbot renew --dry-run   # 자동 갱신 테스트
```

확인: `https://promeet-api.duckdns.org/health`

## 6. 마무리

- 프론트(Vercel)의 API 주소를 `https://promeet-api.duckdns.org`로 변경
- Atlas Network Access에서 `0.0.0.0/0` 삭제 (EC2 IP만 남기기)

## 예산 알림 + EC2 자동 중지 (budget.tf)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # 이메일 입력
terraform plan    # 4 to add
terraform apply
```

- 실제 비용 80% → 알림 메일, 월말 예상치 100% 초과 → 알림 메일
- **실제 비용 100% 도달 → EC2 자동 중지** (Budgets 비용 집계는 하루 몇 번 갱신이라 즉시 멈추진 않음)
- 콘솔에서 따로 만든 예산이 있으면 알림이 중복되니 삭제해도 됨
- 중지된 서버 다시 켜기: `aws ec2 start-instances --instance-ids $(terraform output -raw instance_id)` (컨테이너·Nginx는 자동 재시작)
- 중지돼도 고정 IP·디스크 요금은 계속 나감. 완전히 멈추려면 `terraform destroy`

## 무중단 배포 동작 (deploy/deploy.sh)

1. Nginx가 보고 있는 쪽 확인 (예: blue:3001)
2. 반대쪽(green:3002)에 새 이미지 실행
3. `/health` 통과할 때까지 최대 60초 대기 → **실패하면 전환하지 않고 종료** (기존 버전 계속 서비스)
4. Nginx upstream을 green으로 바꾸고 `reload` (기존 연결 유지)
5. 10초 후 blue 종료

**롤백**: Actions에서 이전 커밋으로 Run workflow 하거나, 서버에서 이전 이미지 태그로 `deploy.sh` 실행

## 자주 쓰는 명령 (Session Manager에서)

```bash
sudo docker ps                              # 실행 중 컨테이너 (blue/green)
sudo docker logs -f promeet-green           # 앱 로그
cat /etc/nginx/promeet/upstream.inc         # 현재 트래픽 대상
sudo tail -f /var/log/cloud-init-output.log # 초기 설치 로그
```

## 비용 / 정리

- 대략 월 $12~15 (EC2 t4g.micro + 퍼블릭 IPv4 + 디스크 20GB)
- 다 지우기: `terraform destroy` (tfstate 버킷은 수동 삭제)
