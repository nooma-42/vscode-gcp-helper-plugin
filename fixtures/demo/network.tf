locals {
  network_id = google_compute_network.main.id
}

resource "google_compute_network" "main" {
  name                    = "blast-radius-demo"
  description             = "Local static-analysis fixture"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "gke" {
  name          = "demo-gke"
  region        = "europe-west1"
  ip_cidr_range = "10.20.0.0/20"
  network       = local.network_id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.24.0.0/14"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.20.16.0/20"
  }
}

resource "google_compute_firewall" "internal" {
  name    = "demo-internal"
  network = google_compute_network.main.self_link

  allow {
    protocol = "tcp"
    ports    = ["443", "5432"]
  }

  source_ranges = [google_compute_subnetwork.gke.ip_cidr_range]
}
