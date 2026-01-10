import type { DependencyEdge, ImpactRule, RuleMatch, TerraformResource } from "./types";

export const GCP_RULES: readonly ImpactRule[] = [
  { id: "vpc-subnet", sourceResourceType: "google_compute_network", relatedResourceTypes: ["google_compute_subnetwork"], relatedAttributes: ["network"], category: "network-topology", severity: "high", message: "Subnet configuration may be affected by the VPC change." },
  { id: "vpc-firewall", sourceResourceType: "google_compute_network", relatedResourceTypes: ["google_compute_firewall"], relatedAttributes: ["network"], category: "network-access", severity: "medium", message: "Firewall policy attachment and network traffic may be affected." },
  { id: "vpc-router", sourceResourceType: "google_compute_network", relatedResourceTypes: ["google_compute_router"], relatedAttributes: ["network"], category: "network-routing", severity: "high", message: "Cloud Router connectivity may be affected by the VPC change." },
  { id: "vpc-private-address", sourceResourceType: "google_compute_network", relatedResourceTypes: ["google_compute_global_address"], relatedAttributes: ["network"], category: "addressing", severity: "high", message: "The reserved private service address may be affected." },
  { id: "vpc-service-networking", sourceResourceType: "google_compute_network", relatedResourceTypes: ["google_service_networking_connection"], relatedAttributes: ["network"], category: "service-networking", severity: "high", message: "Private service networking connectivity may be affected." },
  { id: "vpc-gke", sourceResourceType: "google_compute_network", relatedResourceTypes: ["google_container_cluster"], relatedAttributes: ["network"], category: "gke-networking", severity: "high", message: "The GKE cluster control and data plane networking may be affected." },
  { id: "vpc-sql", sourceResourceType: "google_compute_network", relatedResourceTypes: ["google_sql_database_instance"], relatedAttributes: ["settings.ip_configuration.private_network", "private_network"], category: "database-connectivity", severity: "high", message: "Private database connectivity may be affected." },
  { id: "subnet-gke", sourceResourceType: "google_compute_subnetwork", relatedResourceTypes: ["google_container_cluster"], relatedAttributes: ["subnetwork"], category: "gke-networking", severity: "high", message: "The GKE cluster depends on this subnet for node and workload networking." },
  { id: "subnet-secondary-ranges", sourceResourceType: "google_compute_subnetwork", changedAttributes: ["secondary_ip_range", "secondary_ip_range.range_name", "secondary_ip_range.ip_cidr_range"], relatedResourceTypes: ["google_container_cluster"], category: "gke-networking", severity: "high", message: "GKE pod or service secondary IP allocation may be affected." },
  { id: "firewall-gke", sourceResourceType: "google_compute_firewall", relatedResourceTypes: ["google_container_cluster", "google_container_node_pool"], category: "network-access", severity: "medium", message: "Traffic to or from GKE nodes may be affected." },
  { id: "router-nat", sourceResourceType: "google_compute_router", relatedResourceTypes: ["google_compute_router_nat"], relatedAttributes: ["router"], category: "network-routing", severity: "high", message: "Cloud NAT routing and outbound connectivity may be affected." },
  { id: "nat-gke", sourceResourceType: "google_compute_router_nat", relatedResourceTypes: ["google_container_cluster", "google_container_node_pool"], category: "network-routing", severity: "medium", message: "Private GKE node outbound connectivity may be affected." },
  { id: "gke-node-pool", sourceResourceType: "google_container_cluster", relatedResourceTypes: ["google_container_node_pool"], relatedAttributes: ["cluster"], category: "gke-capacity", severity: "high", message: "Node pool lifecycle or cluster attachment may be affected." },
  { id: "sql-database", sourceResourceType: "google_sql_database_instance", relatedResourceTypes: ["google_sql_database"], relatedAttributes: ["instance"], category: "database-availability", severity: "high", message: "The database depends on the Cloud SQL instance configuration." },
  { id: "sql-user", sourceResourceType: "google_sql_database_instance", relatedResourceTypes: ["google_sql_user"], relatedAttributes: ["instance"], category: "database-access", severity: "high", message: "Database user access depends on the Cloud SQL instance." },
  { id: "service-networking-sql", sourceResourceType: "google_service_networking_connection", relatedResourceTypes: ["google_sql_database_instance"], category: "database-connectivity", severity: "high", message: "Cloud SQL private service connectivity may be affected." },
  { id: "address-service-networking", sourceResourceType: "google_compute_global_address", relatedResourceTypes: ["google_service_networking_connection"], relatedAttributes: ["reserved_peering_ranges"], category: "service-networking", severity: "high", message: "The private service connection address allocation may be affected." },
] as const;

const rank = { low: 0, medium: 1, high: 2 } as const;
export function highestSeverity(values: Array<"low" | "medium" | "high">): "low" | "medium" | "high" {
  return values.reduce((best, value) => rank[value] > rank[best] ? value : best, "low");
}

export function applyImpactRules(source: TerraformResource | undefined, related: TerraformResource | undefined, changedAttributes: string[] = [], confidence: "confirmed" | "inferred" = "confirmed"): RuleMatch[] {
  if (!source || !related) return [];
  return GCP_RULES.filter((rule) => {
    if (rule.sourceResourceType !== source.type) return false;
    if (rule.relatedResourceTypes && !rule.relatedResourceTypes.includes(related.type)) return false;
    if (rule.changedAttributes?.length && changedAttributes.length && !rule.changedAttributes.some((a) => changedAttributes.some((c) => c === a || c.startsWith(`${a}.`) || a.startsWith(`${c}.`)))) return false;
    return true;
  }).map((rule) => ({ ruleId: rule.id, category: rule.category, severity: rule.severity, message: rule.message, recommendation: rule.recommendation, confidence }));
}

function normalizedAssociation(resource: TerraformResource, names: string[]): string[] {
  return resource.attributes
    .filter((attribute) => names.some((name) => attribute.name === name || attribute.name.endsWith(`.${name}`)))
    .map((attribute) => attribute.expression.replace(/\s/g, "").replace(/\.self_link$|\.id$/, ""));
}

/** Adds conservative inferred edges only when two GCP resources use the same explicit network expression. */
export function inferSemanticEdges(resources: Iterable<TerraformResource>): DependencyEdge[] {
  const list = [...resources];
  const edges: DependencyEdge[] = [];
  const networkUsers = list.filter((r) => ["google_compute_firewall", "google_container_cluster", "google_container_node_pool", "google_compute_router_nat"].includes(r.type));
  for (const source of list.filter((r) => r.type === "google_compute_firewall" || r.type === "google_compute_router_nat")) {
    const sourceNetworks = normalizedAssociation(source, ["network", "subnetwork", "router"]);
    if (!sourceNetworks.length) continue;
    for (const target of networkUsers) {
      if (source.address === target.address) continue;
      const targetNetworks = normalizedAssociation(target, ["network", "subnetwork", "router"]);
      if (sourceNetworks.some((value) => targetNetworks.includes(value))) {
        edges.push({ source: source.address, target: target.address, kind: "semantic", confidence: "inferred", attribute: "shared-network", file: target.file });
      }
    }
  }
  return edges;
}
