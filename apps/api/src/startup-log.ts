/** One line, no secrets. The first env file in the list overrides the later ones. */
export function formatStartupSummary(input: {
  port: number;
  corsOrigin: string;
  visionKeySet: boolean;
  model: string;
  loadedEnvFiles: readonly string[];
}): string {
  const only = input.loadedEnvFiles[0];
  const envFiles =
    input.loadedEnvFiles.length === 0 || only === undefined
      ? "none"
      : input.loadedEnvFiles.length === 1
        ? only
        : `${input.loadedEnvFiles.join(" > ")} (first wins)`;
  return `API config port=${input.port} cors=${input.corsOrigin} visionKey=${input.visionKeySet ? "yes" : "no"} model=${input.model} envFiles=${envFiles}`;
}
