output "public_ip" {
  description = "Elastic IP of the instance — use this for the GitHub EC2_HOST secret."
  value       = aws_eip.app.public_ip
}

output "ssh" {
  description = "Ready-to-run SSH command."
  value       = "ssh -i ~/.ssh/ec2_deploy_key ec2-user@${aws_eip.app.public_ip}"
}

output "instance_id" {
  description = "EC2 instance ID (handy for SSM Session Manager)."
  value       = aws_instance.app.id
}
