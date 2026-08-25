import { EditorState } from "prosemirror-state";

import {
  BlockInfo,
  getBlockInfoAt,
  getLastDescendantBlockInfo,
  getPrevBlockInfo,
} from "../../../getBlockInfoFromPos.js";

const canMerge = (prevBlockInfo: BlockInfo, nextBlockInfo: BlockInfo) => {
  return (
    prevBlockInfo.hasContent &&
    prevBlockInfo.contentKind === "inline" &&
    !prevBlockInfo.isContentEmpty &&
    nextBlockInfo.hasContent &&
    nextBlockInfo.contentKind === "inline"
  );
};

const mergeBlocks = (
  state: EditorState,
  dispatch: ((args?: any) => any) | undefined,
  prevBlockInfo: BlockInfo,
  nextBlockInfo: BlockInfo,
) => {
  // Un-nests all children of the next block.
  if (!nextBlockInfo.hasContent) {
    throw new Error(
      `Attempted to merge block at position ${nextBlockInfo.block.beforePos} into previous block at position ${prevBlockInfo.block.beforePos}, but next block is not a block container`,
    );
  }

  // Removes a level of nesting all children of the next block by 1 level, if it contains both content and block
  // group nodes.
  if (nextBlockInfo.children) {
    const childBlocksStart = state.doc.resolve(
      nextBlockInfo.children.childrenStart,
    );
    const childBlocksEnd = state.doc.resolve(
      nextBlockInfo.children.childrenEnd,
    );
    const childBlocksRange = childBlocksStart.blockRange(childBlocksEnd);

    if (dispatch) {
      const pos = state.doc.resolve(nextBlockInfo.block.beforePos);
      state.tr.lift(childBlocksRange!, pos.depth);
    }
  }

  // Deletes the boundary between the two blocks. Can be thought of as
  // removing the closing tags of the first block and the opening tags of the
  // second one to stitch them together.
  if (dispatch) {
    if (!prevBlockInfo.hasContent) {
      throw new Error(
        `Attempted to merge block at position ${nextBlockInfo.block.beforePos} into previous block at position ${prevBlockInfo.block.beforePos}, but previous block is not a block container`,
      );
    }

    // Merging into or out of container blocks (columnLists, callouts, ...)
    // is intentionally unsupported; `canMerge` refuses it above. The
    // container-boundary Backspace/Delete branches in
    // `KeyboardShortcutsExtension` handle those cases by moving blocks
    // across the boundary instead of merging their content.
    dispatch(
      state.tr.delete(prevBlockInfo.contentEnd, nextBlockInfo.contentStart),
    );
  }

  return true;
};

export const mergeBlocksCommand =
  (posBetweenBlocks: number) =>
  ({
    state,
    dispatch,
  }: {
    state: EditorState;
    dispatch: ((args?: any) => any) | undefined;
  }) => {
    const nextBlockInfo = getBlockInfoAt(state.doc, posBetweenBlocks);

    const prevBlockInfo = getPrevBlockInfo(
      state.doc,
      nextBlockInfo.block.beforePos,
    );

    if (!prevBlockInfo) {
      return false;
    }

    const bottomNestedBlockInfo = getLastDescendantBlockInfo(
      state.doc,
      prevBlockInfo,
    );

    if (!canMerge(bottomNestedBlockInfo, nextBlockInfo)) {
      return false;
    }

    return mergeBlocks(state, dispatch, bottomNestedBlockInfo, nextBlockInfo);
  };
