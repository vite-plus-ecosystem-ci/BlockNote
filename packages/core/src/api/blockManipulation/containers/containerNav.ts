import type { Node, NodeType } from "prosemirror-model";

import { isContainerNode, isSealed } from "../../../schema/blocks/children.js";

/**
 * Seal handling for the navigation helpers below. By default the helpers
 * ignore seals. The block manipulation API crosses them freely, since an
 * explicit placement is an intentional crossing. Gesture code (keyboard
 * merges and moves) opts in with `respectSealed`, so content never
 * implicitly crosses a sealed boundary.
 */
type SealOpts = { respectSealed?: boolean };

/**
 * Walks the trailing edge of `holder` (a children holder: `BlockInfo`'s
 * `children`, or a container's own `block` entry — anything with a node and
 * the position before it), descending through nested containers, to the
 * deepest position where `nodeType` fits.
 *
 * The walk ignores seals but reports them: `crossedSeal` is true when a
 * sealed container sat on the path, `holder` itself included. Callers decide
 * the policy — the block manipulation API uses `pos` as-is (an explicit
 * placement is an intentional crossing); gesture code treats
 * `pos !== null && crossedSeal` as "blocked by a seal" (select the sealed
 * container instead of entering it). One walk answers both questions because
 * the descent follows a single path (each container's last child), so the
 * seal-blind and seal-respecting positions are the same — the modes differ
 * only in whether a seal sat on the way.
 */
export function descendToLastInsertionPos(
  holder: { node: Node; beforePos: number },
  nodeType: NodeType,
): { pos: number | null; crossedSeal: boolean } {
  const { node, beforePos } = holder;
  const sealed = isSealed(node);
  const endPos = beforePos + 1 + node.content.size;
  if (node.contentMatchAt(node.childCount).matchType(nodeType)) {
    return { pos: endPos, crossedSeal: sealed };
  }
  const lastChild = node.lastChild;
  if (lastChild && isContainerNode(lastChild.type)) {
    const inner = descendToLastInsertionPos(
      { node: lastChild, beforePos: endPos - lastChild.nodeSize },
      nodeType,
    );
    return { pos: inner.pos, crossedSeal: sealed || inner.crossedSeal };
  }
  return { pos: null, crossedSeal: sealed };
}

// The leading-edge counterpart. No seal reporting: its only callers are API
// code, which crosses seals by construction.
export function descendToFirstInsertionPos(
  holder: { node: Node; beforePos: number },
  nodeType: NodeType,
): number | null {
  const { node, beforePos } = holder;
  const startPos = beforePos + 1;
  if (node.contentMatchAt(0).matchType(nodeType)) {
    return startPos;
  }
  const firstChild = node.firstChild;
  if (firstChild && isContainerNode(firstChild.type)) {
    return descendToFirstInsertionPos(
      { node: firstChild, beforePos: startPos },
      nodeType,
    );
  }
  return null;
}

export function getFirstLeafBlock(
  container: Node,
  containerBeforePos: number,
  opts?: SealOpts,
): { node: Node; beforePos: number } | null {
  // With `respectSealed`, a sealed container's leaf blocks are not reachable
  // from outside.
  if (opts?.respectSealed && isSealed(container)) {
    return null;
  }
  const firstChild = container.firstChild;
  if (!firstChild) {
    return null;
  }
  const firstChildBeforePos = containerBeforePos + 1;
  if (isContainerNode(firstChild.type)) {
    return getFirstLeafBlock(firstChild, firstChildBeforePos, opts);
  }
  return { node: firstChild, beforePos: firstChildBeforePos };
}

/**
 * Climbs out of containers until it reaches a position where `nodeType` fits.
 * `side` picks which edge of each climbed container to land on: `"before"` for
 * moves that put a block above the containers it leaves (Backspace move-out),
 * `"after"` for moves that put it below them (Enter-exit).
 */
export function ascendToInsertablePos(
  doc: Node,
  pos: number,
  nodeType: NodeType,
  opts?: SealOpts,
  side: "before" | "after" = "before",
): number | null {
  for (;;) {
    const $pos = doc.resolve(pos);
    const parent = $pos.node();
    if (parent.contentMatchAt($pos.index()).matchType(nodeType)) {
      return pos;
    }
    if ($pos.depth > 0 && isContainerNode(parent.type)) {
      // With `respectSealed`, climbing out of a sealed container would move
      // content across its boundary.
      if (opts?.respectSealed && isSealed(parent)) {
        return null;
      }
      pos = side === "before" ? $pos.before() : $pos.after();
      continue;
    }
    return null;
  }
}

export function getAncestorContainers(
  doc: Node,
  pos: number,
): { id: string; depth: number }[] {
  const $pos = doc.resolve(pos);
  const containers: { id: string; depth: number }[] = [];
  for (let depth = $pos.depth; depth > 0; depth--) {
    const ancestor = $pos.node(depth);
    if (isContainerNode(ancestor.type) && ancestor.attrs.id) {
      containers.push({ id: ancestor.attrs.id, depth });
    }
  }
  return containers;
}
