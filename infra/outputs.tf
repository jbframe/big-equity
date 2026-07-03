output "public_ip" {
  description = "Elastic IP of the instance — use this for the GitHub EC2_HOST secret."
  value       = aws_eip.app.public_ip
}

output "ssh" {
  description = "Ready-to-run SSH command."
  value       = "ssh -i ~/.ssh/ec2_deploy_key ec2-user@${aws_eip.app.public_ip}"
}

output "app_url" {
  description = "Public URL nginx serves simulationWeb on (ADR-001)."
  value       = "https://${var.app_domain}"
}

output "api_url" {
  description = "Public URL nginx serves simulationAPI on (ADR-002)."
  value       = "https://${var.api_domain}"
}

output "instance_id" {
  description = "EC2 instance ID (handy for SSM Session Manager)."
  value       = aws_instance.app.id
}

output "db_access_role_arn" {
  description = "Role the db-access workflow assumes (ADR-005) — set as the GitHub variable DB_ACCESS_ROLE_ARN."
  value       = aws_iam_role.db_access.arn
}

output "security_group_id" {
  description = "Instance security group the db-access workflow toggles (ADR-005) — set as the GitHub variable DB_SG_ID."
  value       = aws_security_group.app.id
}
