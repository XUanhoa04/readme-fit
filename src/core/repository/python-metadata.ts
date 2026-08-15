function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pyprojectValue(
  pyproject: string | undefined,
  sectionName: string,
  key: string,
): string | undefined {
  if (!pyproject) return undefined;
  const sectionPattern = new RegExp(`^\\[${escapeRegExp(sectionName)}\\]\\s*$`, 'm');
  const sectionMatch = sectionPattern.exec(pyproject);
  if (!sectionMatch) return undefined;
  const start = sectionMatch.index + sectionMatch[0].length;
  const remainder = pyproject.slice(start);
  const nextSection = /^\s*\[[^\]]+\]\s*$/m.exec(remainder);
  const body = nextSection ? remainder.slice(0, nextSection.index) : remainder;
  return new RegExp(
    `^\\s*${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']\\s*(?:#.*)?$`,
    'm',
  ).exec(body)?.[1];
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
