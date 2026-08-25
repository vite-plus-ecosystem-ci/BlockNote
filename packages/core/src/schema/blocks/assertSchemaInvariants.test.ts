// @vitest-environment node
import { Schema } from "prosemirror-model";
import { describe, expect, it } from "vite-plus/test";

import { assertContainerSchemaInvariants } from "./assertSchemaInvariants.js";

// A minimal schema with the structural pieces the invariants inspect:
// `blockContainer`/`blockGroup` regular nesting plus one generated-style
// container node. `extraNodes` lets a case add a deliberately broken node.
function buildSchema(extraNodes: Record<string, any> = {}) {
  return new Schema({
    nodes: {
      doc: { content: "blockGroup" },
      paragraph: { content: "text*", group: "blockContent" },
      blockContainer: {
        content: "blockContent blockGroup?",
        group: "blockGroupChild bnBlock",
      },
      blockGroup: { content: "blockGroupChild+", group: "childContainer" },
      callout: {
        content: "blockGroupChild+",
        group: "bnBlock childContainer blockGroupChild anyContainer",
      },
      ...extraNodes,
      text: {},
    },
  });
}

describe("assertContainerSchemaInvariants", () => {
  it("accepts a schema where every childContainer is blockGroup or a block", () => {
    expect(() => assertContainerSchemaInvariants(buildSchema())).not.toThrow();
  });

  // `isContainerNode` treats "childContainer but not bnBlock" as blockGroup's
  // exclusive shape; a hand-written node in that state would silently be
  // skipped by all container handling, so it must fail at startup instead.
  it("rejects a childContainer node that is not in bnBlock", () => {
    const schema = buildSchema({
      badHolder: { content: "blockGroupChild+", group: "childContainer" },
    });

    expect(() => assertContainerSchemaInvariants(schema)).toThrow(
      /"badHolder".*childContainer.*not in "bnBlock"/,
    );
  });
});
