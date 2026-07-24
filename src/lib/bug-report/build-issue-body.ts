import type { ReportContext } from './context';
import type { CapturedError } from './error-capture';
import { redact } from './redact';

export interface BugReportForm {
  whatHappened: string;
  expected: string;
  steps: string;
}

export interface AttachOptions {
  context: boolean;
  errors: boolean;
}

/** Arma el cuerpo Markdown del issue (redactado al final). */
export function buildIssueBody(
  form: BugReportForm,
  ctx: ReportContext,
  errors: CapturedError[],
  attach: AttachOptions,
): string {
  const lines: string[] = [];

  lines.push('### Qué pasó', form.whatHappened.trim() || '_(sin descripción)_', '');
  if (form.expected.trim()) lines.push('### Qué se esperaba', form.expected.trim(), '');
  if (form.steps.trim()) lines.push('### Pasos para reproducir', form.steps.trim(), '');

  if (attach.context) {
    lines.push(
      '### Entorno',
      '| Campo | Valor |',
      '| --- | --- |',
      `| Ruta | \`${ctx.route}\` |`,
      `| URL | ${ctx.url} |`,
      `| Build | \`${ctx.buildSha}\` |`,
      `| Entorno | ${ctx.environment} |`,
      `| Navegador | ${ctx.userAgent} |`,
      `| Viewport | ${ctx.viewport} |`,
      `| Idioma app | ${ctx.locale} |`,
      `| Idioma navegador | ${ctx.language} |`,
      `| Fecha | ${ctx.timestamp} |`,
      '',
    );
  }

  if (attach.errors && errors.length > 0) {
    lines.push('### Errores recientes', '```');
    for (const e of errors) lines.push(`[${e.time}] (${e.kind}) ${e.message}`);
    lines.push('```', '');
  }

  return redact(lines.join('\n')).trim() + '\n';
}