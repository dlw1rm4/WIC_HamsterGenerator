import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
import {
  formatErrorJson,
  formatSchemaDetailCsv,
  formatSchemaDetailJson,
  formatSchemaListCsv,
  formatSchemaListJson,
  getAggregations,
  getEvent,
  getEventNames,
  validateEvent
} from "./chunk-WCF4U224.js";
import {
  validateJsonOutput
} from "./chunk-XPKWKPWA.js";
import {
  schemaSubcommand
} from "./chunk-QD2PKTAS.js";
import {
  getFlagsSpecification,
  parseArguments,
  printError
} from "./chunk-44XJ762S.js";
import {
  output_manager_default
} from "./chunk-7K6FEHYP.js";
import "./chunk-A2M6YJ6J.js";

// src/commands/metrics/schema.ts
async function schema(client, telemetry) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(schemaSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const flags = parsedArgs.flags;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output_manager_default.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;
  const event = flags["--event"];
  telemetry.trackCliOptionEvent(event);
  telemetry.trackCliOptionFormat(flags["--format"]);
  if (event) {
    const eventResult = validateEvent(event);
    if (!eventResult.valid) {
      if (jsonOutput) {
        client.stdout.write(
          formatErrorJson(
            eventResult.code,
            eventResult.message,
            eventResult.allowedValues
          )
        );
      } else {
        output_manager_default.error(eventResult.message);
        if (eventResult.allowedValues) {
          output_manager_default.print(
            `
Available events: ${eventResult.allowedValues.join(", ")}
`
          );
        }
      }
      return 1;
    }
    const eventData = getEvent(event);
    const eventWithName = { ...eventData, name: event };
    if (jsonOutput) {
      const hasNonCount = eventData.measures.some((m) => m.name !== "count");
      const sampleMeasure = hasNonCount ? eventData.measures.find((m) => m.name !== "count").name : eventData.measures.length > 0 ? "count" : "";
      const aggregations = sampleMeasure ? getAggregations(event, sampleMeasure) : [];
      client.stdout.write(formatSchemaDetailJson(eventWithName, aggregations));
    } else {
      output_manager_default.log(`Event: ${event} - ${eventData.description}`);
      client.stdout.write(formatSchemaDetailCsv(eventWithName));
    }
  } else {
    const events = getEventNames().map((name) => ({
      name,
      description: getEvent(name).description
    }));
    if (jsonOutput) {
      client.stdout.write(formatSchemaListJson(events));
    } else {
      client.stdout.write(formatSchemaListCsv(events));
    }
  }
  return 0;
}
export {
  schema as default
};
