import { Attrs, Fragment, Node, NodeType, Schema } from "@tiptap/pm/model";

import UniqueID from "../../extensions/tiptap-extensions/UniqueID/UniqueID.js";
import type { StyleSchema } from "../../schema";

import type { PartialBlock } from "../../blocks/defaultBlocks";
// `isContainerNode` comes from `children.js` directly (rather than via its
// `fixContainer.js` re-export) because `fixContainer.js` imports `blockToNode`
// below; going through it would create an import cycle.
import {
  createBlockGroup,
  isContainerNode,
  resolveChildren,
} from "../../schema/blocks/children.js";
import { getBlockSchema, getStyleSchema } from "../pmUtil.js";
import { blockOrInlineContentToContentNode } from "./contentToNodes.js";

const EMPTY_SEEDING: ReadonlySet<string> = new Set();

function unwrapsWhenEmptied(blockType: string, schema: Schema): boolean {
  const blockConfig = getBlockSchema(schema)[blockType];
  const children = blockConfig?.children;
  return !!children && resolveChildren(children).whenEmptied === "unwrap";
}

// `createAndFill` produces nodes with `id: null`; patch them before use.
function withGeneratedIds(node: Node): Node {
  if (node.isText) {
    return node;
  }

  const children: Node[] = [];
  let childChanged = false;
  node.forEach((child) => {
    const next = withGeneratedIds(child);
    childChanged ||= next !== child;
    children.push(next);
  });

  const needsId = node.type.isInGroup("bnBlock") && node.attrs.id === null;
  if (!needsId && !childChanged) {
    return node;
  }

  return node.type.create(
    needsId ? { ...node.attrs, id: UniqueID.options.generateID() } : node.attrs,
    childChanged ? Fragment.from(children) : node.content,
    node.marks,
  );
}

// Passes explicit children straight through for unwrap-on-empty containers
// (fill would be undone by the next repair pass) and for unfittable content
// (let `node.check()` report it). An empty child list is the exception: it
// still needs filling to survive the pre-repair `node.check()`.
function createExplicitChildrenNode(
  blockType: string,
  type: NodeType,
  schema: Schema,
  children: Node[],
  attrs: Attrs | null = null,
): Node {
  if (unwrapsWhenEmptied(blockType, schema)) {
    // An empty explicit `children: []` would leave a `min >= 1` container
    // schema-invalid and fail the pre-repair `node.check()`, so fill it (the
    // repair pass unwraps it). Non-empty explicit children are left as given.
    return children.length === 0
      ? (type.createAndFill(attrs) ?? type.create(attrs))
      : type.create(attrs, children);
  }

  return type.createAndFill(attrs, children) ?? type.create(attrs, children);
}

/**
 * Converts a BlockNote block to a Prosemirror node.
 */
export function blockToNode(
  block: PartialBlock<any, any, any>,
  schema: Schema,
  styleSchema: StyleSchema = getStyleSchema(schema),
  seedingTypes: ReadonlySet<string> = EMPTY_SEEDING,
) {
  let id = block.id;

  if (id === undefined) {
    id = UniqueID.options.generateID();
  }

  const children: Node[] = [];

  if (block.children) {
    for (const child of block.children) {
      children.push(blockToNode(child, schema, styleSchema, seedingTypes));
    }
  }

  const isBlockContent =
    !block.type || // can happen if block.type is not defined (this should create the default node)
    schema.nodes[block.type].isInGroup("blockContent");

  if (isBlockContent) {
    const contentNode = blockOrInlineContentToContentNode(
      block,
      schema,
      styleSchema,
    );

    const groupNode =
      children.length > 0 ? createBlockGroup(schema, children) : undefined;

    return schema.nodes["blockContainer"].createChecked(
      {
        id: id,
        ...block.props,
      },
      groupNode ? [contentNode, groupNode] : contentNode,
    );
  } else if (isContainerNode(schema.nodes[block.type])) {
    const type = schema.nodes[block.type];
    const attrs = { id: id, ...block.props };

    if (block.children !== undefined) {
      return withGeneratedIds(
        createExplicitChildrenNode(block.type, type, schema, children, attrs),
      );
    }

    // No explicit `children`: seed the container from its `children` config's
    // `default`, converting each default child exactly like an inserted block.
    // `seedingTypes` tracks the container types currently being seeded so a
    // cyclic `default` (a container whose default children seed it again)
    // fails loudly instead of recursing forever.
    const childrenConfig = getBlockSchema(schema)[block.type]?.children;
    const defaultChildren = childrenConfig
      ? resolveChildren(childrenConfig).default
      : undefined;

    let seeded: Node[] | undefined;
    if (defaultChildren && defaultChildren.length > 0) {
      if (seedingTypes.has(block.type)) {
        throw new Error(
          `Seeding "${block.type}" ends up seeding it again (${[...seedingTypes, block.type].join(" -> ")}). ` +
            "Give the cyclic default explicit children, or remove the self-reference.",
        );
      }

      const nextSeeding = new Set(seedingTypes).add(block.type);
      seeded = defaultChildren.map((child) =>
        blockToNode(
          child as PartialBlock<any, any, any>,
          schema,
          styleSchema,
          nextSeeding,
        ),
      );
    }

    if (!seeded && unwrapsWhenEmptied(block.type, schema)) {
      // Fill so the node satisfies its own content expression for the
      // `node.check()` that runs before the repair pass (e.g. in
      // `removeAndInsertBlocks`); that pass then unwraps the still-empty
      // container. Without the fill, a `min >= 1` unwrap container with no
      // `default` produces a schema-invalid node and `check()` throws.
      return withGeneratedIds(type.createAndFill(attrs) ?? type.create(attrs));
    }

    const node = type.createAndFill(attrs, seeded);
    if (!node) {
      throw new Error(
        `Cannot create block "${block.type}": its \`default\` children don't fit its \`children\` config ` +
          `(it accepts \`${type.spec.content}\`).`,
      );
    }

    return withGeneratedIds(node);
  } else {
    throw new Error(
      `block type ${block.type} doesn't match blockContent or bnBlock group`,
    );
  }
}
