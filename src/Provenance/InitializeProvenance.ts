import Provenance, {
  ActionFunction,
  SubscriberFunction,
  ExportedState,
  ArtifactSubscriberFunction
} from '../Interfaces/Provenance';
import deepCopy from '../Utils/DeepCopy';
import { ProvenanceGraph } from '../Interfaces/ProvenanceGraph';
import {
  NodeID,
  NodeMetadata,
  Artifacts,
  RootNode,
  isStateNode
} from '../Interfaces/NodeInterfaces';
import {
  createProvenanceGraph,
  applyActionFunction,
  goToNode,
  importState,
  addExtraToNodeArtifact,
  getExtraFromArtifact
} from './ProvenanceGraphFunction';
import { initEventManager } from '../Utils/EventManager';
import deepDiff from '../Utils/DeepDiff';
const decompressFromEncodedURIComponent = require('lz-string').decompressFromEncodedURIComponent;
const compressToEncodedURIComponent = require('lz-string').compressToEncodedURIComponent;

export default function initProvenance<T, S, A>(
  initialState: T,
  loadFromUrl: boolean = false
): Provenance<T, S, A> {
  let graph = createProvenanceGraph<T, S, A>(initialState);

  const initalStateRecord = deepCopy(initialState) as any;

  const EM = initEventManager<T, S, A>();

  const surroundChars = '||';

  function loadUrl() {
    if (!window || !window.location || !window.location.href) {
      throw new Error(
        'Window and/or location not defined. Make sure this is a browser environment.'
      );
    }
    const url = window.location.href;

    if (!url.includes('||')) {
      return;
    }

    const importString = url.split('||').reverse()[0];

    const importedState = JSON.parse(decompressFromEncodedURIComponent(importString)) as T;

    importStateAndAddNode(importedState);
  }

  function curr() {
    return graph.nodes[graph.current];
  }

  function triggerEvents(oldState: T) {
    const currentState = graph.nodes[graph.current].state;
    const diffs = deepDiff(oldState, currentState);

    EM.callEvents(diffs || [], currentState, curr());
  }

  function importStateAndAddNode(state: T) {
    graph = importState(graph, initalStateRecord, state);
  }

  return {
    graph: () => deepCopy(graph),
    current: () => deepCopy(graph.nodes[graph.current]),
    root: () => deepCopy(graph.nodes[graph.root] as RootNode<T, S>),
    applyAction: (
      label: string,
      action: ActionFunction<T>,
      args?: any[],
      metadata: NodeMetadata<S> = {},
      artifacts?: Artifacts<A>,
      eventType?: S
    ) => {
      const oldState = deepCopy(graph.nodes[graph.current].state);

      if (eventType) {
        metadata.type = eventType;
      }

      graph = applyActionFunction(graph, label, action, args, metadata, artifacts);
      triggerEvents(oldState);
      return graph.nodes[graph.current].state;
    },
    goToNode: (id: NodeID) => {
      const oldState = deepCopy(graph.nodes[graph.current].state);
      graph = goToNode(graph, id);
      triggerEvents(oldState);
    },
    addExtraToNodeArtifact: (id: NodeID, extra: A) => {
      graph = addExtraToNodeArtifact(graph, id, extra);
      EM.callEvents([], graph.nodes[id].state, graph.nodes[id]);
    },
    getExtraFromArtifact: (id: NodeID) => {
      return getExtraFromArtifact<T, S, A>(graph, id);
    },
    goBackOneStep: () => {
      const oldState = deepCopy(graph.nodes[graph.current].state);
      const current = graph.nodes[graph.current];
      if (isStateNode(current)) {
        graph = goToNode(graph, current.parent);
      } else {
        throw new Error('Already at root');
      }
      triggerEvents(oldState);
    },
    goBackNSteps: (n: number) => {
      const oldState = deepCopy(graph.nodes[graph.current].state);
      const num = n;
      let tempGraph: ProvenanceGraph<T, S, A> = deepCopy(graph) as any;
      while (n > 0) {
        let current = tempGraph.nodes[tempGraph.current];
        if (isStateNode(current)) {
          tempGraph = goToNode(graph, current.parent) as any;
        } else {
          throw new Error(`Cannot go back ${num} steps. Reached root after ${num - n} steps`);
        }
        n--;
      }
      graph = tempGraph;
      triggerEvents(oldState);
    },
    goForwardOneStep: () => {
      const oldState = deepCopy(graph.nodes[graph.current].state);
      let current = graph.nodes[graph.current];
      if (current.children.length > 0) {
        graph = goToNode(graph, current.children.reverse()[0]);
      } else {
        throw new Error('Already at the latest node in this branch');
      }

      triggerEvents(oldState);
    },
    reset: () => {
      const oldState = deepCopy(graph.nodes[graph.current].state);
      graph = goToNode(graph, graph.root);
      triggerEvents(oldState);
    },
    done: () => {
      if (loadFromUrl) {
        const oldState = deepCopy(graph.nodes[graph.current].state);
        loadUrl();
        triggerEvents(oldState);
      }
    },
    addObserver: (propPath: string[], func: SubscriberFunction<T>) => {
      const state = graph.nodes[graph.current].state as any;
      let path = state;

      propPath.forEach((prop: string) => {
        const keys = Object.keys(path);
        if (!keys.includes(prop)) throw new Error(`Path ${propPath.join('.')} does not exist`);
        path = path[prop];
      });

      EM.addObserver(propPath, func);
    },
    addGlobalObserver: (func: SubscriberFunction<T>) => {
      EM.addGlobalObserver(func);
    },
    addArtifactObserver: (func: ArtifactSubscriberFunction<A>) => {
      EM.addArtifactObserver(func);
    },
    exportState: (partial: boolean = false) => {
      let exportedState: Partial<T> = {};
      const currentState = graph.nodes[graph.current].state as any;

      if (partial) {
        Object.keys(currentState).forEach(key => {
          const prev = initalStateRecord[key];
          const curr = currentState[key];
          if (JSON.stringify(prev) !== JSON.stringify(curr)) {
            exportedState = { ...exportedState, [key]: currentState[key] };
          }
        });
      } else {
        exportedState = { ...currentState };
      }

      const exportedStateObject: ExportedState<T> = exportedState;
      const compressedString = compressToEncodedURIComponent(JSON.stringify(exportedStateObject));

      return `${surroundChars}${compressedString}`;
    },
    importState: (importString: string) => {
      const oldState = deepCopy(graph.nodes[graph.current].state);
      const importedStates: ExportedState<T> = JSON.parse(
        decompressFromEncodedURIComponent(importString.replace('||', ''))
      );
      const state = { ...graph.nodes[graph.current].state, ...importedStates };
      importStateAndAddNode(state);
      triggerEvents(oldState);
    },
    exportProvenanceGraph: () => JSON.stringify(graph),
    importProvenanceGraph: (importString: string) => {
      const oldState = deepCopy(graph.nodes[graph.current].state);
      graph = JSON.parse(importString);
      triggerEvents(oldState);
    }
  };
}
