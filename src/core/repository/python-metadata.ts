import { parse as parseToml } from 'smol-toml';

function parsed(pyproject: string | undefined): Record<string, unknown> | undefined {
  if (!pyproject) return undefined;
  try {
    return parseToml(pyproject);
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nested(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    const table = record(current);
    if (!table) return undefined;
    current = table[segment];
  }
  return current;
}

export function isValidPyproject(pyproject: string | undefined): boolean {
  return pyproject === undefined || parsed(pyproject) !== undefined;
}

export function pyprojectValue(
  pyproject: string | undefined,
  sectionName: string,
  key: string,
): string | undefined {
  const document = parsed(pyproject);
  if (!document) return undefined;
  const section = record(nested(document, sectionName));
  const value = section?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function pythonPackageName(pyproject?: string): string | undefined {
  return (
    pyprojectValue(pyproject, 'project', 'name') ??
    pyprojectValue(pyproject, 'tool.poetry', 'name')
  );
}

export function pythonRuntimeConstraint(pyproject?: string): string | undefined {
  return (
    pyprojectValue(pyproject, 'project', 'requires-python') ??
    pyprojectValue(pyproject, 'tool.poetry.dependencies', 'python')
  );
}

export function pythonLicense(pyproject?: string): string | undefined {
  const document = parsed(pyproject);
  if (!document) return undefined;
  const project = record(nested(document, 'project'));
  const projectLicense = project?.license;
  if (typeof projectLicense === 'string') return projectLicense;
  const licenseTable = record(projectLicense);
  if (typeof licenseTable?.text === 'string') return licenseTable.text;
  return pyprojectValue(pyproject, 'tool.poetry', 'license');
}
