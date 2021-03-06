import { ProvenanceGraph } from '../Interfaces/ProvenanceGraph';
import {
  RootNode,
  NodeID,
  NodeMetadata,
  Artifacts,
  StateNode,
  Diff,
  isStateNode,
  Extra
} from '../Interfaces/NodeInterfaces';
import generateUUID from '../Utils/generateUUID';
import generateTimeStamp from '../Utils/generateTimeStamp';
import deepCopy from '../Utils/DeepCopy';
import { ActionFunction } from '../Interfaces/Provenance';
import deepDiff from '../Utils/DeepDiff';

export function createProvenanceGraph<T, S, A>(state: T): ProvenanceGraph<T, S, A> {
  const root: RootNode<T, S> = {
    id: generateUUID(),
    label: 'Root',
    metadata: {
      createdOn: generateTimeStamp(),
      type: 'Root'
    },
    children: [],
    state
  };

  const graph: ProvenanceGraph<T, S, A> = {
    nodes: {
      [root.id]: root
    },
    root: root.id,
    current: root.id
  };

  return graph;
}

export function goToNode<T, S, A>(
  graph: ProvenanceGraph<T, S, A>,
  id: NodeID
): ProvenanceGraph<T, S, A> {
  const newGraph = deepCopy(graph);

  const newCurrentNode = graph.nodes[id];

  if (!newCurrentNode) {
    throw new Error('No such node exists');
  }

  newGraph.current = newCurrentNode.id;

  return newGraph;
}

export function importState<T, S, A>(
  graph: ProvenanceGraph<T, S, A>,
  initalState: T,
  importedState: T
) {
  const newGraph = deepCopy(graph);

  const createNewStateNode = (parent: NodeID, state: T, diffs: Diff[]): StateNode<T, S, A> => ({
    id: generateUUID(),
    label: 'Imported state',
    metadata: {
      createdOn: generateTimeStamp()
    },
    artifacts: {
      extra: [],
      diffs
    },
    parent: parent,
    children: [],
    state
  });

  const diffs = deepDiff(initalState, importedState);

  const newNode = createNewStateNode(graph.current, importedState, diffs);

  newGraph.nodes[newNode.id] = newNode;
  newGraph.nodes[newGraph.current].children.push(newNode.id);
  newGraph.current = newNode.id;

  return newGraph;
}

export function addExtraToNodeArtifact<T, S, A>(
  graph: ProvenanceGraph<T, S, A>,
  id: NodeID,
  extra: A
): ProvenanceGraph<T, S, A> {
  const newGraph = deepCopy(graph);
  const node = newGraph.nodes[id];

  if (isStateNode(node)) {
    node.artifacts.extra.push({
      time: generateTimeStamp(),
      e: extra
    });
  } else {
    throw new Error('Cannot add artifacts to Root Node');
  }

  return newGraph;
}

export function getExtraFromArtifact<T, S, A>(
  graph: ProvenanceGraph<T, S, A>,
  id: NodeID
): Extra<A>[] {
  const node = graph.nodes[id];
  if (isStateNode(node)) {
    return node.artifacts.extra || [];
  }
  throw new Error('Root does not have artifacts');
}

export function applyActionFunction<T, S, A>(
  graph: ProvenanceGraph<T, S, A>,
  label: string,
  action: ActionFunction<T>,
  args?: any[],
  metadata?: NodeMetadata<S>,
  artifacts: Partial<Artifacts<A>> = {}
): ProvenanceGraph<T, S, A> {
  const newGraph = deepCopy(graph);

  const { current: currentId } = newGraph;

  const currentState = deepCopy(newGraph.nodes[currentId].state);

  const createNewStateNode = (parent: NodeID, state: T, diffs: Diff[]): StateNode<T, S, A> => ({
    id: generateUUID(),
    label: label,
    metadata: {
      createdOn: generateTimeStamp(),
      ...metadata
    },
    artifacts: {
      diffs,
      extra: [],
      ...artifacts
    },
    parent: parent,
    children: [],
    state
  });

  const newState = args ? action(currentState, ...args) : action(currentState);
  const parentId = graph.current;

  const diffs = deepDiff(graph.nodes[currentId].state, newState);

  const newNode = createNewStateNode(parentId, newState, diffs);

  newGraph.nodes[newNode.id] = newNode;
  newGraph.nodes[currentId].children.push(newNode.id);
  newGraph.current = newNode.id;

  // console.log(JSON.stringify(newGraph, null, 2));

  return newGraph;
}
