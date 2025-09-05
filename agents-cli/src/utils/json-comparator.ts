/**
 * Options for JSON comparison
 */
export interface ComparisonOptions {
  /** Whether to ignore order in arrays (default: true) */
  ignoreArrayOrder?: boolean;
  /** Whether to ignore case in string comparisons (default: false) */
  ignoreCase?: boolean;
  /** Whether to ignore whitespace differences (default: false) */
  ignoreWhitespace?: boolean;
  /** Custom key paths to ignore during comparison */
  ignorePaths?: string[];
  /** Whether to show detailed differences (default: false) */
  showDetails?: boolean;
}

/**
 * Result of JSON comparison
 */
export interface ComparisonResult {
  /** Whether the objects are equivalent */
  isEqual: boolean;
  /** List of differences found */
  differences: Difference[];
  /** Summary statistics */
  stats: {
    totalKeys: number;
    differentKeys: number;
    missingKeys: number;
    extraKeys: number;
  };
}

/**
 * Represents a difference between two objects
 */
export interface Difference {
  /** Path to the differing value */
  path: string;
  /** Type of difference */
  type: 'different' | 'missing' | 'extra' | 'type_mismatch';
  /** Value in the first object */
  value1?: any;
  /** Value in the second object */
  value2?: any;
  /** Description of the difference */
  description: string;
}

/**
 * Compare two JSON objects for structural equivalence
 * Handles arrays with different ordering and nested objects
 */
export function compareJsonObjects(
  obj1: any,
  obj2: any,
  options: ComparisonOptions = {}
): ComparisonResult {
  const {
    ignoreArrayOrder = true,
    ignoreCase = false,
    ignoreWhitespace = false,
    ignorePaths = [],
  } = options;

  const differences: Difference[] = [];
  const stats = {
    totalKeys: 0,
    differentKeys: 0,
    missingKeys: 0,
    extraKeys: 0,
  };

  function normalizeValue(value: any): any {
    if (typeof value === 'string') {
      let normalized = value;
      if (ignoreCase) {
        normalized = normalized.toLowerCase();
      }
      if (ignoreWhitespace) {
        normalized = normalized.trim().replace(/\s+/g, ' ');
      }
      return normalized;
    }
    return value;
  }

  function shouldIgnorePath(path: string): boolean {
    return ignorePaths.some((ignorePath) => {
      if (ignorePath.endsWith('*')) {
        return path.startsWith(ignorePath.slice(0, -1));
      }
      return path === ignorePath;
    });
  }

  function compareValues(value1: any, value2: any, path: string = ''): boolean {
    if (shouldIgnorePath(path)) {
      return true;
    }

    // Handle null/undefined
    if (value1 === null || value1 === undefined) {
      if (value2 === null || value2 === undefined) {
        return true;
      }
      differences.push({
        path,
        type: 'different',
        value1,
        value2,
        description: `Null/undefined mismatch: ${value1} vs ${value2}`,
      });
      return false;
    }

    if (value2 === null || value2 === undefined) {
      differences.push({
        path,
        type: 'different',
        value1,
        value2,
        description: `Null/undefined mismatch: ${value1} vs ${value2}`,
      });
      return false;
    }

    // Handle different types
    if (typeof value1 !== typeof value2) {
      differences.push({
        path,
        type: 'type_mismatch',
        value1,
        value2,
        description: `Type mismatch: ${typeof value1} vs ${typeof value2}`,
      });
      return false;
    }

    // Handle primitives
    if (typeof value1 !== 'object') {
      const normalized1 = normalizeValue(value1);
      const normalized2 = normalizeValue(value2);

      if (normalized1 !== normalized2) {
        differences.push({
          path,
          type: 'different',
          value1,
          value2,
          description: `Value mismatch: ${value1} vs ${value2}`,
        });
        return false;
      }
      return true;
    }

    // Handle arrays
    if (Array.isArray(value1) && Array.isArray(value2)) {
      if (value1.length !== value2.length) {
        differences.push({
          path,
          type: 'different',
          value1: value1.length,
          value2: value2.length,
          description: `Array length mismatch: ${value1.length} vs ${value2.length}`,
        });
        return false; // Array length mismatch is a fundamental difference
      }

      if (ignoreArrayOrder) {
        // Compare arrays ignoring order
        const sorted1 = [...value1].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        );
        const sorted2 = [...value2].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        );

        for (let i = 0; i < sorted1.length; i++) {
          compareValues(sorted1[i], sorted2[i], `${path}[${i}]`); // Don't return false, just collect differences
        }
      } else {
        // Compare arrays in order
        for (let i = 0; i < value1.length; i++) {
          compareValues(value1[i], value2[i], `${path}[${i}]`); // Don't return false, just collect differences
        }
      }
      return true;
    }

    // Handle objects
    if (typeof value1 === 'object' && typeof value2 === 'object') {
      const keys1 = Object.keys(value1);
      const keys2 = Object.keys(value2);
      const allKeys = new Set([...keys1, ...keys2]);

      stats.totalKeys += allKeys.size;

      for (const key of allKeys) {
        const currentPath = path ? `${path}.${key}` : key;

        if (!keys1.includes(key)) {
          differences.push({
            path: currentPath,
            type: 'missing',
            value2: value2[key],
            description: `Missing key in first object: ${key}`,
          });
          stats.missingKeys++;
          continue; // Continue checking other keys instead of returning false
        }

        if (!keys2.includes(key)) {
          differences.push({
            path: currentPath,
            type: 'extra',
            value1: value1[key],
            description: `Extra key in first object: ${key}`,
          });
          stats.extraKeys++;
          continue; // Continue checking other keys instead of returning false
        }

        if (!compareValues(value1[key], value2[key], currentPath)) {
          stats.differentKeys++;
          // Don't return false here, continue checking other keys
        }
      }
      return true;
    }

    return true;
  }

  compareValues(obj1, obj2);

  return {
    isEqual: differences.length === 0,
    differences,
    stats,
  };
}

/**
 * Create a normalized version of a JSON object for comparison
 * This can be useful for creating a canonical representation
 */
export function normalizeJsonObject(obj: any, options: ComparisonOptions = {}): any {
  const { ignoreArrayOrder = true, ignoreCase = false, ignoreWhitespace = false } = options;

  function normalizeValue(value: any): any {
    if (typeof value === 'string') {
      let normalized = value;
      if (ignoreCase) {
        normalized = normalized.toLowerCase();
      }
      if (ignoreWhitespace) {
        normalized = normalized.trim().replace(/\s+/g, ' ');
      }
      return normalized;
    }

    if (Array.isArray(value)) {
      const normalizedArray = value.map(normalizeValue);
      if (ignoreArrayOrder) {
        return normalizedArray.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      }
      return normalizedArray;
    }

    if (typeof value === 'object' && value !== null) {
      const normalizedObj: any = {};
      const sortedKeys = Object.keys(value).sort();
      for (const key of sortedKeys) {
        normalizedObj[key] = normalizeValue(value[key]);
      }
      return normalizedObj;
    }

    return value;
  }

  return normalizeValue(obj);
}

/**
 * Get a summary of differences in a human-readable format
 */
export function getDifferenceSummary(result: ComparisonResult): string {
  if (result.isEqual) {
    return '✅ Objects are equivalent';
  }

  const { differences, stats } = result;
  const summary = [`❌ Objects differ (${differences.length} differences found)`];

  summary.push(`📊 Statistics:`);
  summary.push(`  • Total keys: ${stats.totalKeys}`);
  summary.push(`  • Different values: ${stats.differentKeys}`);
  summary.push(`  • Missing keys: ${stats.missingKeys}`);
  summary.push(`  • Extra keys: ${stats.extraKeys}`);

  if (differences.length > 0) {
    summary.push(`\n🔍 Differences:`);
    differences.slice(0, 10).forEach((diff, index) => {
      summary.push(`  ${index + 1}. ${diff.path}: ${diff.description}`);
    });

    if (differences.length > 10) {
      summary.push(`  ... and ${differences.length - 10} more differences`);
    }
  }

  return summary.join('\n');
}
