output "subnet_id" {
  value = google_compute_subnetwork.gke.id
}

output "subnet_cidr" {
  value = google_compute_subnetwork.gke.ip_cidr_range
}
