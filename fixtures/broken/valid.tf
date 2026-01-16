resource "google_compute_network" "still_parseable" {
  name = "valid-neighbour"
}

resource "google_compute_subnetwork" "still_parseable" {
  name          = "valid-neighbour"
  region        = "europe-west1"
  ip_cidr_range = "10.70.0.0/24"
  network       = google_compute_network.still_parseable.id
}
