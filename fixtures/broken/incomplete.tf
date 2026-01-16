# Intentionally malformed. Parser errors in this file must not stop valid.tf.
resource "google_compute_firewall" "being_edited" {
  name    = "unfinished-rule"
  network = google_compute_network.still_parseable.id

  allow {
    protocol = "tcp"
    ports    = ["443",
