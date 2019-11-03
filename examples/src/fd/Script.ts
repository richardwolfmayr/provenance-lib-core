//
import * as d3 from "d3";
import * as ProvenanceLibrary from "@visdesignlab/provenance-lib-core/lib/src/index.js";
import Bars from "./FDBar"
import Graph from "./FDGraph"


function CreateApp(provenance: ProvenanceLibrary.Provenance<NodeState>) {
  return {
    currentState: () => provenance.graph().current.state
  };
}

export interface NodeState {
  nodes: {
    nodeMap: {};
    selectedNode:string;
  }
};

const initialState: NodeState = {
  nodes: {
    nodeMap: {},
    selectedNode: 'none'
  }
}

d3.json("../miserables.json").then(graph => {

  let simulation = runSimulation(graph);

  let currProv = setupProvenance();

  let provenance = currProv[0] as ProvenanceLibrary.Provenance<NodeState>;
  let app = currProv[1] as {currentState: () => NodeState;};

  let hoverOver = function(currData){
    if(currData.id){
      barVis.hoverBar(currData.id);
      graphVis.hoverNode(currData.id);
    }
    else{
      barVis.hoverBar(currData);
      graphVis.hoverNode(currData);
    }
  }

  let hoverOut = function(){
    barVis.dehoverBars();
    graphVis.dehoverNodes();
  }

  let select = function(currData){
    provenance.applyAction({
      label: "Node Selected",
      action: (id:string) => {
        const test = (app.currentState() as any) as NodeState;
        test.nodes.selectedNode = id;
        return test;
      },
      args: [currData.id ? currData.id : currData]
    });
  }

  let dragEnded = function(d){
    provenance.applyAction({
      label: "Node Moved",
      action: (id:string) => {
        const test = (app.currentState() as any) as NodeState;
        test.nodes.nodeMap[d.id][0] = d.x;
        test.nodes.nodeMap[d.id][1] = d.y;
        return test;
      },
      args: [d.id]
    });
  }

  initializeProvenanceState(graph, provenance, app);

  const barVis = new Bars(graph, hoverOver, hoverOut, select);
  const graphVis = new Graph(graph, hoverOver, hoverOut, select, dragEnded);

  provenance.addObserver("nodes.selectedNode", () => {
    barVis.selectBar(provenance.graph().current.state.nodes.selectedNode);
    graphVis.selectNode(provenance.graph().current.state.nodes.selectedNode);
  });
});

function setupProvenance(){
  const provenance = ProvenanceLibrary.initProvenance(initialState);

  const app = CreateApp(provenance);

  return [provenance, app];
}

function runSimulation(graph){
  let simulation = d3.forceSimulation()
      .force("link", d3.forceLink().id(function(d:any) { return d.id; }))
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter(530 / 2, 610 / 2));

  simulation
      .nodes(graph.nodes);

  simulation.force<d3.ForceLink<any, any>>('link').links(graph.links);

  for(let i = 0; i < 300; i++){
    simulation.tick();
  }

  return simulation;
}

function initializeProvenanceState(graph, provenance, app) {
    var dict = {}
    let arr:any[] = graph.nodes;

    for (let i = 0; i < arr.length; i++)
    {
      let curr = arr[i].id
      dict[curr]  = [arr[i].x, arr[i].y]
    }

    provenance.applyAction({
      label: "Nodes Placed",
      action: (dict:{}) => {
        const test = (app.currentState() as any) as NodeState;
        test.nodes.nodeMap = dict;
        return test;
      },
      args: [dict]
    });
  }

// export function setState(provenance, app, d, b){
//   console.log(d);
//   if(d.data){
//     provenance.goToNode(d.data.id);
//   }
//   else if (d.id){
//     provenance.goToNode(d.id);
//   }
//   else{
//     provenance.goToNode(d);
//   }
//
//   console.log(provenance.graph().current.state.nodes)
//
//   let newGraph = provenance.graph().current.state.nodes.nodeMap
//
//   for(let i of globalGraph.nodes){
//     i.x = newGraph[i.id][0];
//     i.y = newGraph[i.id][1];
//   }
//
//   for(let i of globalGraph.links){
//     i.source.x = newGraph[i.source.id][0];
//     i.source.y = newGraph[i.source.id][1];
//     i.target.x = newGraph[i.target.id][0];
//     i.target.y = newGraph[i.target.id][1];
//   }
//
//   drawGraph(globalGraph, provenance, app);
//
//   let currSelected = provenance.graph().current.state.nodes.selectedNode;
//
//   deselectAllBars();
//   deselectAllNodes();
//
//   if(currSelected != "none"){
//     selectNode(globalGraph, currSelected, provenance, app);
//     selectBar(globalGraph, currSelected, provenance, app);
//   }
// }
