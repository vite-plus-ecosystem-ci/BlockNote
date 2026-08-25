import {
  NodeSelection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { TextCursorPosition } from "../../../editor/cursorPositionTypes.js";
import type {
  BlockIdentifier,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "../../../schema/index.js";
import { UnreachableCaseError } from "../../../util/typescript.js";
import {
  getBlockInfoFromNode,
  getBlockInfoFromSelection,
  getNodeId,
  getParentBlockInfo,
} from "../../getBlockInfoFromPos.js";
import { nodeToBlock } from "../../nodeConversions/nodeToBlock.js";
import { getNodeById } from "../../nodeUtil.js";
import { getBlockNoteSchema, getPmSchema } from "../../pmUtil.js";

export function getTextCursorPosition<
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(tr: Transaction): TextCursorPosition<BSchema, I, S> {
  const { block } = getBlockInfoFromSelection(tr);

  const resolvedPos = tr.doc.resolve(block.beforePos);
  // Gets previous blockContainer node at the same nesting level, if the current node isn't the first child.
  const prevNode = resolvedPos.nodeBefore;

  // Gets next blockContainer node at the same nesting level, if the current node isn't the last child.
  const nextNode = tr.doc.resolve(block.afterPos).nodeAfter;

  // Gets the parent block's node, if the current block is nested.
  const parentNode = getParentBlockInfo(tr.doc, block.beforePos)?.block.node;

  return {
    block: nodeToBlock(block.node, tr.doc),
    prevBlock: prevNode === null ? undefined : nodeToBlock(prevNode, tr.doc),
    nextBlock: nextNode === null ? undefined : nodeToBlock(nextNode, tr.doc),
    parentBlock:
      parentNode === undefined ? undefined : nodeToBlock(parentNode, tr.doc),
  };
}

export function setTextCursorPosition(
  tr: Transaction,
  targetBlock: BlockIdentifier,
  placement: "start" | "end" = "start",
) {
  const id = typeof targetBlock === "string" ? targetBlock : targetBlock.id;
  const pmSchema = getPmSchema(tr.doc);
  const schema = getBlockNoteSchema(pmSchema);

  const posInfo = getNodeById(id, tr.doc);
  if (!posInfo) {
    throw new Error(`Block with ID ${id} not found`);
  }

  const info = getBlockInfoFromNode(posInfo.node, posInfo.posBeforeNode);

  const contentType: "none" | "inline" | "table" | "plain" =
    schema.blockSchema[info.blockNoteType]!.content;

  if (info.hasContent) {
    const content = info.content;
    if (contentType === "none") {
      tr.setSelection(NodeSelection.create(tr.doc, content.beforePos));
      return;
    }

    if (contentType === "inline" || contentType === "plain") {
      if (placement === "start") {
        tr.setSelection(TextSelection.create(tr.doc, info.contentStart));
      } else {
        tr.setSelection(TextSelection.create(tr.doc, info.contentEnd));
      }
    } else if (contentType === "table") {
      // 4 levels in from the table's edge: table > row > cell > paragraph.
      tr.setSelection(
        TextSelection.create(
          tr.doc,
          placement === "start" ? content.beforePos + 4 : content.afterPos - 4,
        ),
      );
    } else {
      throw new UnreachableCaseError(contentType);
    }
  } else {
    const child =
      placement === "start"
        ? info.children.node.firstChild
        : info.children.node.lastChild;

    if (!child) {
      // A container allowed to hold no children has no text to put a cursor
      // in, so the container itself is selected instead.
      tr.setSelection(NodeSelection.create(tr.doc, info.block.beforePos));
      return;
    }

    setTextCursorPosition(tr, getNodeId(child, tr.doc), placement);
  }
}
