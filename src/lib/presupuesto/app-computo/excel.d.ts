/**
 * excel.js from the "Cómputo y Presupuesto" app (app_computo), copied as-is so
 * exported workbooks are exactly the ones that app makes (and re-imports).
 */
import type ExcelJSNs from 'exceljs'
import type { ProyectoApp } from '../formato-app'

declare const CPExcel: {
  exportar(proyecto: ProyectoApp, ExcelJS: typeof ExcelJSNs): Promise<ArrayBuffer>
}
export default CPExcel
