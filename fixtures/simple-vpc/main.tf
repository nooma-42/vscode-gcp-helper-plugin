variable "environments" {
  type    = set(string)
  default = ["dev", "staging"]
}

locals {
  base_network = google_compute_network.main
  network_link = local.base_network.self_link
  ports_by_environment = {
    dev     = ["22"]
    staging = ["443"]
  }
}

resource "google_compute_network" "main" {
  name                    = "shared-services"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "application" {
  name          = "${google_compute_network.main.name}-applications"
  region        = "europe-west1"
  ip_cidr_range = "10.30.0.0/20"
  network       = local.network_link
}

resource "google_compute_firewall" "environment" {
  for_each = var.environments

  name    = "${google_compute_network.main.name}-${each.key}"
  network = local.network_link

  allow {
    protocol = "tcp"
    ports    = local.ports_by_environment[each.key]
  }

  source_ranges = [google_compute_subnetwork.application.ip_cidr_range]
  depends_on    = [google_compute_subnetwork.application]
}

output "network_id" {
  value = local.base_network.id
}
