/** Worker remains the portable/Sites default; Node is an explicit self-host profile. */
export function readRuntimeProfile(value = process.env.FUSION_RUNTIME) {
  if (value === undefined || value === "") return "worker";
  if (value !== "node" && value !== "worker") {
    throw new Error("FUSION_RUNTIME must be node or worker.");
  }
  return value;
}
