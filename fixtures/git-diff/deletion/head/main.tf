resource "google_compute_network" "main" {
  name = "deletion-fixture"
}

resource "google_compute_firewall" "legacy" {
  name    = "legacy-rule"
  network = google_compute_network.main.id

  allow {
    protocol = "icmp"
  }
}
