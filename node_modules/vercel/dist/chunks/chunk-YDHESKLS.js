import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
import {
  table
} from "./chunk-RPCYSXCP.js";
import {
  require_strip_ansi
} from "./chunk-IKEWUNXZ.js";
import {
  require_dist
} from "./chunk-7K6FEHYP.js";
import {
  __toESM,
  require_source
} from "./chunk-A2M6YJ6J.js";

// src/util/get-invalid-subcommand.ts
function getInvalidSubcommand(config) {
  return `Please specify a valid subcommand: ${Object.keys(config).join(
    " | "
  )}`;
}

// src/util/input/read-standard-input.ts
async function readStandardInput(stdin) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(""), 500);
    if (stdin.isTTY) {
      resolve("");
    } else {
      stdin.setEncoding("utf8");
      stdin.once("data", resolve);
    }
  });
}

// src/util/target/get-custom-environments.ts
var import_error_utils = __toESM(require_dist(), 1);
async function getCustomEnvironments(client, projectId) {
  try {
    const res = await client.fetch(
      `/projects/${encodeURIComponent(projectId)}/custom-environments`,
      { method: "GET" }
    );
    return res.environments;
  } catch (error) {
    if ((0, import_error_utils.isObject)(error) && error.status === 404) {
      return [];
    }
    throw error;
  }
}
function pickCustomEnvironment(customEnvironments, customEnvironmentSlugOrId) {
  if (!customEnvironmentSlugOrId)
    return void 0;
  return customEnvironments.find(
    ({ slug, id }) => slug === customEnvironmentSlugOrId || id === customEnvironmentSlugOrId
  );
}

// src/util/format-table.ts
var import_chalk = __toESM(require_source(), 1);

// src/util/strlen.ts
var import_strip_ansi = __toESM(require_strip_ansi(), 1);
function strlen(str) {
  return (0, import_strip_ansi.default)(str).length;
}

// src/util/format-table.ts
function formatTable(header, align, blocks) {
  const nrCols = header.length;
  const padding = [];
  let out = "\n";
  for (let i = 0; i < nrCols; i++) {
    padding[i] = blocks.reduce((acc, block) => {
      const maxLen = Math.max(...block.rows.map((row) => strlen(`${row[i]}`)));
      return Math.max(acc, Math.ceil(maxLen / 8));
    }, 1);
  }
  for (const block of blocks) {
    if (block.name) {
      out += `${block.name}
`;
    }
    const rows = [header.map((s) => import_chalk.default.dim(s))].concat(block.rows);
    if (rows.length > 0) {
      rows[0][0] = ` ${rows[0][0]}`;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].slice(0);
        row[0] = ` ${row[0]}`;
        for (let j = 0; j < nrCols; j++) {
          const col = `${row[j]}`;
          const al = align[j] || "l";
          const repeat = padding[j] > 1 ? padding[j] * 8 - strlen(col) : 0;
          const pad = repeat > 0 ? " ".repeat(repeat) : "";
          rows[i][j] = al === "l" ? col + pad : pad + col;
        }
      }
      out += table(rows, { align, hsep: 4 });
    }
    out += "\n\n";
  }
  return out.slice(0, -1);
}

export {
  getInvalidSubcommand,
  readStandardInput,
  getCustomEnvironments,
  pickCustomEnvironment,
  formatTable
};
