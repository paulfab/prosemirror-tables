import {Plugin, PluginKey} from "prosemirror-state"
import {Decoration, DecorationSet} from "prosemirror-view"
import {cellAround, pointsAtCell, setAttr} from "./util"
import {TableMap} from "./tablemap"
import {TableView, updateColumns} from "./tableview"
import {tableNodeTypes} from "./schema"
import {addColumn,removeColumn,addRow,removeRow} from "./commands"

export const key = new PluginKey("tableColumnResizing")

export function columnResizing({ handleWidth = 5, cellMinWidth = 25, View = TableView, lastColumnResizable = true } = {}) {
  let plugin = new Plugin({
    key,
    state: {
      init(_, state) {
        this.spec.props.nodeViews[tableNodeTypes(state.schema).table.name] =
          (node, view) => new View(node, cellMinWidth, view)
        return new ResizeState(-1, false)
      },
      apply(tr, prev) {
        return prev.apply(tr)
      }
    },
    props: {
      attributes(state) {
        let pluginState = key.getState(state)
        return pluginState.activeHandle > -1 ? {class: "resize-cursor"} : null
      },

      handleDOMEvents: {
        mousemove(view, event) { handleMouseMove(view, event, handleWidth, cellMinWidth, lastColumnResizable) },
        mouseleave(view) { handleMouseLeave(view) },
        mousedown(view, event) { handleMouseDown(view, event, cellMinWidth) },
        mouseover(view, event) { handleMouseOver(view, event) }
      },

      decorations(state) {
        let pluginState = key.getState(state)
        if (pluginState.activeHandle > -1) return handleDecorations(state, pluginState.activeHandle)
      },

      nodeViews: {}
    }
  })
  return plugin
}

class ResizeState {
  constructor(activeHandle, dragging) {
    this.activeHandle = activeHandle
    this.dragging = dragging
  }

  apply(tr) {
    let state = this, action = tr.getMeta(key)
    if (action && action.setHandle != null)
      return new ResizeState(action.setHandle, null)
    if (action && action.setDragging !== undefined){
	    console.log(action)
      return new ResizeState(state.activeHandle, action.setDragging)
    }
    if (state.activeHandle > -1 && tr.docChanged) {
      let handle = tr.mapping.map(state.activeHandle, -1)
      if (!pointsAtCell(tr.doc.resolve(handle))) handle = null
      state = new ResizeState(handle, state.dragging)
    }
    return state
  }
}

function handleMouseMove(view, event, handleWidth, cellMinWidth, lastColumnResizable) {
  let pluginState = key.getState(view.state)

  if (!pluginState.dragging) {
    let target = domCellAround(event.target), cell = -1
    if (target) {
      let {left, right} = target.getBoundingClientRect()
      if (event.clientX - left <= handleWidth)
        cell = edgeCell(view, event, "left")
      else if (right - event.clientX <= handleWidth)
        cell = edgeCell(view, event, "right")
    }

    if (cell != pluginState.activeHandle) {
      if (!lastColumnResizable && cell !== -1) {
        let $cell = view.state.doc.resolve(cell)
        let table = $cell.node(-1), map = TableMap.get(table), start = $cell.start(-1)
        let col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1

        if (col == map.width - 1) {
          return
        }
      }

      updateHandle(view, cell)
    }
  }
}

function handleMouseOver(view, event ) {
	if (!view.editable)
		return -1
	if(key.getState(view.state).dragging)
		return 
    if(event.target.classList.contains("cell-prosemirror") && !event.target.but){
        let found = view.posAtCoords({left: event.clientX, top: event.clientY})
          if (!found) return -1
           let but = create_el("div","wrapper-button-table-edit",`<div  class="button-table-edit">...</div><div class="dropdown-table" style="display:none"></div>`,{"style":"top:"+(event.target.getBoundingClientRect()["y"] - get("main_editor").getBoundingClientRect()["y"] +2 )+"px;right:"+( get("main_editor").getBoundingClientRect()["right"] - event.target.getBoundingClientRect()["right"]  +2)+"px"})
        view.dom.parentElement.parentElement.appendChild(but)

            event.target.addEventListener("mouseleave",function(e){
  			let pluginState = key.getState(view.state)
                        if (but.parentElement && ! but.contains( e.relatedTarget)){
                            event.target.but = null
                            but.parentElement.removeChild(but)
                            }
                    })
              but.addEventListener("mouseleave",function(e){
                        event.target.but = null
                        if (but.parentElement) but.parentElement.removeChild(but)
                    })
            but.onclick= function(){ but.querySelector(".dropdown-table").style["display"] = ""}
            let $pos = cellAround(view.state.doc.resolve(found.pos))
		if (!$pos) {
			but.parentElement.removeChild(but)
			return -1
		}
            let table = $pos.node(-1), tableStart = $pos.start(-1), map = TableMap.get(table)
            let rect = map.findCell($pos.pos - tableStart)
            rect.tableStart = tableStart
            rect.map = map
            rect.table = table

            let add_row = create_el("div","","Add row")
            but.querySelector(".dropdown-table").appendChild(add_row)
            let add_column = create_el("div","","Add column")
            but.querySelector(".dropdown-table").appendChild(add_column)
            let remove_row = create_el("div","","Remove row")
            but.querySelector(".dropdown-table").appendChild(remove_row)
            let remove_column = create_el("div","","Remove column")
            but.querySelector(".dropdown-table").appendChild(remove_column)
            add_column.onclick = function(){view.dispatch(addColumn(view.state.tr,rect,rect.right)) }
            add_row.onclick = function(){view.dispatch(addRow(view.state.tr,rect,rect.bottom)) }
            remove_column.onclick = function(){
                let tr = view.state.tr
                removeColumn(tr,rect,rect.right -1)
                view.dispatch(tr) }
            remove_row.onclick = function(){
                let tr = view.state.tr
                removeRow(tr,rect,rect.bottom -1)
                view.dispatch(tr) }
            event.target.but = but
        }

}


function handleMouseLeave(view) {
  let pluginState = key.getState(view.state)
  if (pluginState.activeHandle > -1 && !pluginState.dragging) updateHandle(view, -1)
}

function handleMouseDown(view, event, cellMinWidth) {
  let pluginState = key.getState(view.state)
  if (pluginState.activeHandle == -1 || pluginState.dragging) return false

Array.from(view.dom.parentElement.parentElement.querySelectorAll(".wrapper-button-table-edit")).forEach(function(s){
		s.parentElement.removeChild(s)})

  let cell = view.state.doc.nodeAt(pluginState.activeHandle)
  let width = currentColWidth(view, pluginState.activeHandle, cell.attrs)
  view.dispatch(view.state.tr.setMeta(key, {setDragging: {startX: event.clientX, startWidth: width}}))

  function finish(event) {
    window.removeEventListener("mouseup", finish)
    window.removeEventListener("mousemove", move)
    let pluginState = key.getState(view.state)
    if (pluginState.dragging) {
      let width = getNewColumnWidth(view, pluginState.activeHandle, draggedWidth(pluginState.dragging, event, cellMinWidth))
      updateColumnWidth(view, pluginState.activeHandle, width)
      view.dispatch(view.state.tr.setMeta(key, {setDragging: null}))
    }
  }
  function move(event) {
    if (!event.which) return finish(event)
    let pluginState = key.getState(view.state)
      let width = getNewColumnWidth(view, pluginState.activeHandle, draggedWidth(pluginState.dragging, event, cellMinWidth))
    //let dragged = draggedWidth(pluginState.dragging, event, cellMinWidth)
      console.log("dragged " + draggedWidth(pluginState.dragging, event, cellMinWidth))
      console.log("percent " + width)
    displayColumnWidth(view, pluginState.activeHandle, width, cellMinWidth)
  }

  window.addEventListener("mouseup", finish)
  window.addEventListener("mousemove", move)
  event.preventDefault()
  return true
}

function currentColWidth(view, cellPos, {colspan, colwidth}) {
  let width = colwidth && colwidth[colwidth.length - 1]
  let dom = view.domAtPos(cellPos)
  let node = dom.node.childNodes[dom.offset]
  let sum_width = 0
  colwidth.forEach(function(e){sum_width +=e})
   return node.offsetWidth  *(width/sum_width)
  let domWidth = node.offsetWidth, parts = colspan
  if (colwidth) {
	  for (let i = 0; i < colspan; i++) if (colwidth[i]) {
    domWidth -= colwidth[i]
    parts--
  }
  }
	  domwWidth = domWidth * dom.closest("table").offsetWidth
  return domWidth / parts
}

function domCellAround(target) {
  while (target && target.nodeName != "TD" && target.nodeName != "TH")
    target = target.classList.contains("ProseMirror") ? null : target.parentNode
  return target
}

function edgeCell(view, event, side) {
  let found = view.posAtCoords({left: event.clientX, top: event.clientY})
  if (!found) return -1
  let {pos} = found
  let $cell = cellAround(view.state.doc.resolve(pos))
  if (!$cell) return -1
  if (side == "right") return $cell.pos
  let map = TableMap.get($cell.node(-1)), start = $cell.start(-1)
  let index = map.map.indexOf($cell.pos - start)
  return index % map.width == 0 ? -1 : start + map.map[index - 1]
}

function draggedWidth(dragging, event, cellMinWidth) {
  let offset = event.clientX - dragging.startX
  return Math.max(cellMinWidth, dragging.startWidth + offset)
}

function updateHandle(view, value) {
  view.dispatch(view.state.tr.setMeta(key, {setHandle: value}))
}

function updateColumnWidth(view, cell, width) {
  let $cell = view.state.doc.resolve(cell)
  let table = $cell.node(-1), map = TableMap.get(table), start = $cell.start(-1)
  let col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1
  let tr = view.state.tr
  for (let row = 0; row < map.height; row++) {
    let mapIndex = row * map.width + col
    // Rowspanning cell that has already been handled
    if (row && map.map[mapIndex] == map.map[mapIndex - map.width]) continue
    let pos = map.map[mapIndex], {attrs} = table.nodeAt(pos)
    let index = attrs.colspan == 1 ? 0 : col - map.colCount(pos)
    if (attrs.colwidth && attrs.colwidth[index] == width) continue
    let colwidth = attrs.colwidth ? attrs.colwidth.slice() : zeroes(attrs.colspan)
    colwidth[index] = width
    tr.setNodeMarkup(start + pos, null, setAttr(attrs, "colwidth", colwidth))
  }
  if (tr.docChanged) view.dispatch(tr)
}

function getNewColumnWidth(view, cell, width, cellMinWidth) {
  let $cell = view.state.doc.resolve(cell)
  let table = $cell.node(-1), start = $cell.start(-1)
  let overrideCol = TableMap.get(table).colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1
  let dom = view.domAtPos($cell.start(-1)).node
  dom = dom.closest("table")

  let totalWidth = 0
  let row = table.firstChild
 for (let i = 0, col = 0; i < row.childCount; i++) {
    let {colspan, colwidth} = row.child(i).attrs
    for (let j = 0; j < colspan; j++, col++) {
      let cssWidth = colwidth ? colwidth[j] : 50
	 if (col != overrideCol)
      		totalWidth +=cssWidth
    }
  }

  let ratio = width/dom.getBoundingClientRect()["width"]

return ratio * totalWidth/(1-ratio)

}

function displayColumnWidth(view, cell, width, cellMinWidth) {
  let $cell = view.state.doc.resolve(cell)
  let table = $cell.node(-1), start = $cell.start(-1)
  let col = TableMap.get(table).colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1
  let dom = view.domAtPos($cell.start(-1)).node
  dom = dom.closest("table")
  updateColumns(table, dom.firstChild, dom, cellMinWidth, col, width)
}

function zeroes(n) {
  let result = []
  for (let i = 0; i < n; i++) result.push(0)
  return result
}

function handleDecorations(state, cell) {
  let decorations = []
  let $cell = state.doc.resolve(cell)
  let table = $cell.node(-1), map = TableMap.get(table), start = $cell.start(-1)
  let col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan
  for (let row = 0; row < map.height; row++) {
    let index = col + row * map.width - 1
    // For positions that are have either a different cell or the end
    // of the table to their right, and either the top of the table or
    // a different cell above them, add a decoration
    if ((col == map.width || map.map[index] != map.map[index + 1]) &&
        (row == 0 || map.map[index - 1] != map.map[index - 1 - map.width])) {
      let cellPos = map.map[index]
      let pos = start + cellPos + table.nodeAt(cellPos).nodeSize - 1
      let dom = document.createElement("div")
      dom.className = "column-resize-handle"
      decorations.push(Decoration.widget(pos, dom))
    }
  }
  return DecorationSet.create(state.doc, decorations)
}
