import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

// Point this at AXI stdout from a fresh envtest import, not mesheryctl stdout.
// Expected values come from the component definitions in meshery/meshery#22423
// at 4e4d17f, independently of the importer's output. Do not import twice just
// to collect a report: meshery/meshery#22424 documents duplicate registration.
const capture = process.env.MESHERYCTL_AXI_ENVTEST_IMPORT_REPORT;

it.runIf(capture)("reports the infisical-operator envtest import", async () => {
  const report = (await readFile(capture!, "utf8")).replaceAll("\r\n", "\n");
  expect(report).toMatch(/^ *name: infisical-operator$/m);
  expect(report).toMatch(/^ *version: v0\.11\.12$/m);
  expect(report).toMatch(/^ *(?:component_count|count): 7$/m);

  const table = /^([ ]*)components\[7\]\{name,kind,version\}:\n((?:\1  [^\n]+(?:\n|$))+)/m.exec(report);
  expect(table, "expected seven component rows").not.toBeNull();
  const rows = table![2].trim().split("\n").map(line => line.trim()).sort();
  expect(rows).toEqual([
    "Cluster Generator,ClusterGenerator,secrets.infisical.com/v1alpha1",
    "Infisical Auth,InfisicalAuth,secrets.infisical.com/v1beta1",
    "Infisical Connection,InfisicalConnection,secrets.infisical.com/v1beta1",
    "Infisical Dynamic Secret,InfisicalDynamicSecret,secrets.infisical.com/v1alpha1",
    "Infisical Push Secret,InfisicalPushSecret,secrets.infisical.com/v1alpha1",
    "Infisical Secret,InfisicalSecret,secrets.infisical.com/v1alpha1",
    "Infisical Static Secret,InfisicalStaticSecret,secrets.infisical.com/v1beta1",
  ]);
  const help = report.split(/^help\[\d+\]:\n/m)[1];
  expect(help).toMatch(/^  mesheryctl-axi model view infisical-operator$/m);
  expect(help).toMatch(/^  mesheryctl-axi component list$/m);
});
