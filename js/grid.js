/**
 * Virtualized Spreadsheet Grid Engine - Main Module
 * Łączy wyspecjalizowane podmoduły w katalogu js/grid/:
 * - js/grid/grid-core.js (definicja klasy, DOM, wymiary, stan)
 * - js/grid/grid-render.js (wirtualizacja i renderowanie)
 * - js/grid/grid-selection.js (zaznaczanie i nawigacja)
 * - js/grid/grid-clipboard.js (schowek, fill handle, marching ants)
 * - js/grid/grid-editor.js (edycja komórek)
 * - js/grid/grid-contextmenu.js (menu PPM i operacje kolumnowe)
 * - js/grid/grid-events.js (zdarzenia myszy i skróty klawiszowe)
 */

if (typeof window !== 'undefined' && !window.CSVGrid && typeof global !== 'undefined' && global.CSVGrid) {
  window.CSVGrid = global.CSVGrid;
}
if (typeof global !== 'undefined' && !global.CSVGrid && typeof window !== 'undefined' && window.CSVGrid) {
  global.CSVGrid = window.CSVGrid;
}
