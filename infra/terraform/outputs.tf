output "instance_id" {
  value = aws_instance.validation.id
}
output "public_ip" {
  value = aws_instance.validation.public_ip
}
output "cleanup_deadline" {
  value = var.expires_at
}
output "resource_tags" {
  value = local.tags
}
