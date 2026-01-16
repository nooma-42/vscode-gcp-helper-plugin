resource "google_compute_network" "old" {
  name                    = "shared-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "application" {
  name          = "application"
  region        = "europe-west1"
  ip_cidr_range = "10.60.0.0/20"
  network       = google_compute_network.old.id
}
