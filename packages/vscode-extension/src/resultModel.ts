import * as vscode from "vscode";
import type { BlastRadiusReport } from "./types";

export class ResultModel {
  private reportsValue: BlastRadiusReport[] = [];
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  get reports(): BlastRadiusReport[] {
    return this.reportsValue;
  }

  set(reports: BlastRadiusReport[]): void {
    this.reportsValue = reports;
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
