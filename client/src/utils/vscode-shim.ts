/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from './uri';

export function illegalArgument(name?: string): Error {
	if (name) {
		return new Error(`Illegal argument: ${name}`);
	} else {
		return new Error("Illegal argument");
	}
}

export class Disposable {

	static from(...disposables: { dispose(): any }[]): Disposable {
		return new Disposable(function () {
			if (disposables) {
				for (let disposable of disposables) {
					if (disposable && typeof disposable.dispose === 'function') {
						disposable.dispose();
					}
				}
				disposables = undefined;
			}
		});
	}

	private _callOnDispose: Function;

	constructor(callOnDispose: Function) {
		this._callOnDispose = callOnDispose;
	}

	dispose(): any {
		if (typeof this._callOnDispose === 'function') {
			this._callOnDispose();
			this._callOnDispose = undefined;
		}
	}
}

export interface EditorOptions {
	tabSize: number | string;
	insertSpaces: boolean | string;
}

export class Position {

	static Min(...positions: Position[]): Position {
		let result = positions.pop();
		for (let p of positions) {
			if (p.isBefore(result)) {
				result = p;
			}
		}
		return result;
	}

	static Max(...positions: Position[]): Position {
		let result = positions.pop();
		for (let p of positions) {
			if (p.isAfter(result)) {
				result = p;
			}
		}
		return result;
	}

	private _line: number;
	private _character: number;

	get line(): number {
		return this._line;
	}

	get character(): number {
		return this._character;
	}

	constructor(line: number, character: number) {
		if (line < 0) {
			throw illegalArgument('line must be positive');
		}
		if (character < 0) {
			throw illegalArgument('character must be positive');
		}
		this._line = line;
		this._character = character;
	}

	isBefore(other: Position): boolean {
		if (this._line < other._line) {
			return true;
		}
		if (other._line < this._line) {
			return false;
		}
		return this._character < other._character;
	}

	isBeforeOrEqual(other: Position): boolean {
		if (this._line < other._line) {
			return true;
		}
		if (other._line < this._line) {
			return false;
		}
		return this._character <= other._character;
	}

	isAfter(other: Position): boolean {
		return !this.isBeforeOrEqual(other);
	}

	isAfterOrEqual(other: Position): boolean {
		return !this.isBefore(other);
	}

	isEqual(other: Position): boolean {
		return this._line === other._line && this._character === other._character;
	}

	compareTo(other: Position): number {
		if (this._line < other._line) {
			return -1;
		} else if (this._line > other.line) {
			return 1;
		} else {
			// equal line
			if (this._character < other._character) {
				return -1;
			} else if (this._character > other._character) {
				return 1;
			} else {
				// equal line and character
				return 0;
			}
		}
	}

	translate(lineDelta: number = 0, characterDelta: number = 0): Position {
		if (lineDelta === 0 && characterDelta === 0) {
			return this;
		}
		return new Position(this.line + lineDelta, this.character + characterDelta);
	}

	with(line: number = this.line, character: number = this.character): Position {
		if (line === this.line && character === this.character) {
			return this;
		}
		return new Position(line, character);
	}

	toJSON(): any {
		return { line: this.line, character: this.character };
	}
}

export class Range {

	protected _start: Position;
	protected _end: Position;

	get start(): Position {
		return this._start;
	}

	get end(): Position {
		return this._end;
	}

	constructor(start: Position, end: Position);
	constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);
	constructor(startLineOrStart: number | Position, startColumnOrEnd: number | Position, endLine?: number, endColumn?: number) {
		let start: Position;
		let end: Position;

		if (typeof startLineOrStart === 'number' && typeof startColumnOrEnd === 'number' && typeof endLine === 'number' && typeof endColumn === 'number') {
			start = new Position(startLineOrStart, startColumnOrEnd);
			end = new Position(endLine, endColumn);
		} else if (startLineOrStart instanceof Position && startColumnOrEnd instanceof Position) {
			start = startLineOrStart;
			end = startColumnOrEnd;
		}

		if (!start || !end) {
			throw new Error('Invalid arguments');
		}

		if (start.isBefore(end)) {
			this._start = start;
			this._end = end;
		} else {
			this._start = end;
			this._end = start;
		}
	}

	contains(positionOrRange: Position | Range): boolean {
		if (positionOrRange instanceof Range) {
			return this.contains(positionOrRange._start)
				&& this.contains(positionOrRange._end);

		} else if (positionOrRange instanceof Position) {
			if (positionOrRange.isBefore(this._start)) {
				return false;
			}
			if (this._end.isBefore(positionOrRange)) {
				return false;
			}
			return true;
		}
		return false;
	}

	isEqual(other: Range): boolean {
		return this._start.isEqual(other._start) && this._end.isEqual(other._end);
	}

	intersection(other: Range): Range {
		let start = Position.Max(other.start, this._start);
		let end = Position.Min(other.end, this._end);
		if (start.isAfter(end)) {
			// this happens when there is no overlap:
			// |-----|
			//		  |----|
			return;
		}
		return new Range(start, end);
	}

	union(other: Range): Range {
		if (this.contains(other)) {
			return this;
		} else if (other.contains(this)) {
			return other;
		}
		let start = Position.Min(other.start, this._start);
		let end = Position.Max(other.end, this.end);
		return new Range(start, end);
	}

	get isEmpty(): boolean {
		return this._start.isEqual(this._end);
	}

	get isSingleLine(): boolean {
		return this._start.line === this._end.line;
	}

	with(start: Position = this.start, end: Position = this.end): Range {
		if (start.isEqual(this._start) && end.isEqual(this.end)) {
			return this;
		}
		return new Range(start, end);
	}

	toJSON(): any {
		return [this.start, this.end];
	}
}

export class Selection extends Range {

	private _anchor: Position;

	public get anchor(): Position {
		return this._anchor;
	}

	private _active: Position;

	public get active(): Position {
		return this._active;
	}

	constructor(anchor: Position, active: Position);
	constructor(anchorLine: number, anchorColumn: number, activeLine: number, activeColumn: number);
	constructor(anchorLineOrAnchor: number | Position, anchorColumnOrActive: number | Position, activeLine?: number, activeColumn?: number) {
		let anchor: Position;
		let active: Position;

		if (typeof anchorLineOrAnchor === 'number' && typeof anchorColumnOrActive === 'number' && typeof activeLine === 'number' && typeof activeColumn === 'number') {
			anchor = new Position(anchorLineOrAnchor, anchorColumnOrActive);
			active = new Position(activeLine, activeColumn);
		} else if (anchorLineOrAnchor instanceof Position && anchorColumnOrActive instanceof Position) {
			anchor = anchorLineOrAnchor;
			active = anchorColumnOrActive;
		}

		if (!anchor || !active) {
			throw new Error('Invalid arguments');
		}

		super(anchor, active);

		this._anchor = anchor;
		this._active = active;
	}

	get isReversed(): boolean {
		return this._anchor === this._end;
	}

	toJSON() {
		return {
			start: this.start,
			end: this.end,
			active: this.active,
			anchor: this.anchor
		};
	}
}

export class TextEdit {

	static replace(range: Range, newText: string): TextEdit {
		return new TextEdit(range, newText);
	}

	static insert(position: Position, newText: string): TextEdit {
		return TextEdit.replace(new Range(position, position), newText);
	}

	static delete(range: Range): TextEdit {
		return TextEdit.replace(range, '');
	}

	protected _range: Range;

	protected _newText: string;

	get range(): Range {
		return this._range;
	}

	set range(value: Range) {
		if (!value) {
			throw illegalArgument('range');
		}
		this._range = value;
	}

	get newText(): string {
		return this._newText || '';
	}

	set newText(value) {
		this._newText = value;
	}

	constructor(range: Range, newText: string) {
		this.range = range;
		this.newText = newText;
	}

	toJSON(): any {
		return {
			range: this.range,
			newText: this.newText
		};
	}
}

export class Uri extends URI { }

export class WorkspaceEdit {

	private _values: [Uri, TextEdit[]][] = [];
	private _index: { [uri: string]: number } = Object.create(null);

	replace(uri: Uri, range: Range, newText: string): void {
		let edit = new TextEdit(range, newText);
		let array = this.get(uri);
		if (array) {
			array.push(edit);
		} else {
			this.set(uri, [edit]);
		}
	}

	insert(resource: Uri, position: Position, newText: string): void {
		this.replace(resource, new Range(position, position), newText);
	}

	delete(resource: Uri, range: Range): void {
		this.replace(resource, range, '');
	}

	has(uri: Uri): boolean {
		return typeof this._index[uri.toString()] !== 'undefined';
	}

	set(uri: Uri, edits: TextEdit[]): void {
		let idx = this._index[uri.toString()];
		if (typeof idx === 'undefined') {
			let newLen = this._values.push([uri, edits]);
			this._index[uri.toString()] = newLen - 1;
		} else {
			this._values[idx][1] = edits;
		}
	}

	get(uri: Uri): TextEdit[] {
		let idx = this._index[uri.toString()];
		return typeof idx !== 'undefined' && this._values[idx][1];
	}

	entries(): [Uri, TextEdit[]][] {
		return this._values;
	}

	get size(): number {
		return this._values.length;
	}

	toJSON(): any {
		return this._values;
	}
}

export enum DiagnosticSeverity {
	Hint = 3,
	Information = 2,
	Warning = 1,
	Error = 0
}

export class Location {

	uri: URI;
	range: Range;

	constructor(uri: URI, range: Range | Position) {
		this.uri = uri;

		if (range instanceof Range) {
			this.range = range;
		} else if (range instanceof Position) {
			this.range = new Range(range, range);
		} else {
			throw new Error('Illegal argument');
		}
	}

	toJSON(): any {
		return {
			uri: this.uri,
			range: this.range
		};
	}
}

export class Diagnostic {

	range: Range;
	message: string;
	source: string;
	code: string | number;
	severity: DiagnosticSeverity;

	constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
		this.range = range;
		this.message = message;
		this.severity = severity;
	}

	toJSON(): any {
		return {
			severity: DiagnosticSeverity[this.severity],
			message: this.message,
			range: this.range,
			source: this.source,
			code: this.code,
		};
	}
}

export class Hover {

	public contents: MarkedString[];
	public range: Range;

	constructor(contents: MarkedString | MarkedString[], range?: Range) {
		if (!contents) {
			throw new Error('Illegal argument');
		}

		if (Array.isArray(contents)) {
			this.contents = contents;
		} else {
			this.contents = [contents];
		}
		this.range = range;
	}
}

export enum DocumentHighlightKind {
	Text,
	Read,
	Write
}

export class DocumentHighlight {

	range: Range;
	kind: DocumentHighlightKind;

	constructor(range: Range, kind: DocumentHighlightKind = DocumentHighlightKind.Text) {
		this.range = range;
		this.kind = kind;
	}

	toJSON(): any {
		return {
			range: this.range,
			kind: DocumentHighlightKind[this.kind]
		};
	}
}

export enum SymbolKind {
	File,
	Module,
	Namespace,
	Package,
	Class,
	Method,
	Property,
	Field,
	Constructor,
	Enum,
	Interface,
	Function,
	Variable,
	Constant,
	String,
	Number,
	Boolean,
	Array,
	Object,
	Key,
	Null
}

export class SymbolInformation {

	name: string;
	location: Location;
	kind: SymbolKind;
	containerName: string;

	constructor(name: string, kind: SymbolKind, range: Range, uri?: URI, containerName?: string) {
		this.name = name;
		this.kind = kind;
		this.location = new Location(uri, range);
		this.containerName = containerName;
	}

	toJSON(): any {
		return {
			name: this.name,
			kind: SymbolKind[this.kind],
			location: this.location,
			containerName: this.containerName
		};
	}
}

export class CodeLens {

	range: Range;

	command: Command;

	constructor(range: Range, command?: Command) {
		this.range = range;
		this.command = command;
	}

	get isResolved(): boolean {
		return !!this.command;
	}
}

export class ParameterInformation {

	label: string;
	documentation: string;

	constructor(label: string, documentation?: string) {
		this.label = label;
		this.documentation = documentation;
	}
}

export class SignatureInformation {

	label: string;
	documentation: string;
	parameters: ParameterInformation[];

	constructor(label: string, documentation?: string) {
		this.label = label;
		this.documentation = documentation;
		this.parameters = [];
	}
}

export class SignatureHelp {

	signatures: SignatureInformation[];
	activeSignature: number;
	activeParameter: number;

	constructor() {
		this.signatures = [];
	}
}

export enum CompletionItemKind {
	Text,
	Method,
	Function,
	Constructor,
	Field,
	Variable,
	Class,
	Interface,
	Module,
	Property,
	Unit,
	Value,
	Enum,
	Keyword,
	Snippet,
	Color,
	File,
	Reference
}

export class CompletionItem {

	label: string;
	kind: CompletionItemKind;
	detail: string;
	documentation: string;
	sortText: string;
	filterText: string;
	insertText: string;
	textEdit: TextEdit;

	constructor(label: string) {
		this.label = label;
	}

	toJSON(): any {
		return {
			label: this.label,
			kind: CompletionItemKind[this.kind],
			detail: this.detail,
			documentation: this.documentation,
			sortText: this.sortText,
			filterText: this.filterText,
			insertText: this.insertText,
			textEdit: this.textEdit
		};
	}
}

export class CompletionList {

	isIncomplete: boolean;

	items: CompletionItem[];

	constructor(items: CompletionItem[] = [], isIncomplete: boolean = false) {
		this.items = items;
		this.isIncomplete = isIncomplete;
	}
}

export enum ViewColumn {
	One = 1,
	Two = 2,
	Three = 3
}

export enum StatusBarAlignment {
	Left = 1,
	Right = 2
}

export enum EndOfLine {
	LF = 1,
	CRLF = 2
}



export type MarkedString = string | { language: string; value: string };

export interface Command {
	/**
	 * Title of the command, like `save`.
	 */
	title: string;

	/**
	 * The identifier of the actual command handler.
	 * @see [commands.registerCommand](#commands.registerCommand).
	 */
	command: string;

	/**
	 * Arguments that the command handler should be
	 * invoked with.
	 */
	arguments?: any[];
}

/**
	 * Represents a text document, such as a source file. Text documents have
	 * [lines](#TextLine) and knowledge about an underlying resource like a file.
	 */
export interface TextDocument {

	/**
	 * The associated URI for this document. Most documents have the __file__-scheme, indicating that they
	 * represent files on disk. However, some documents may have other schemes indicating that they are not
	 * available on disk.
	 *
	 * @readonly
	 */
	uri: Uri;

	/**
	 * The file system path of the associated resource. Shorthand
	 * notation for [TextDocument.uri.fsPath](#TextDocument.uri.fsPath). Independent of the uri scheme.
	 *
	 * @readonly
	 */
	fileName: string;

	/**
	 * Is this document representing an untitled file.
	 *
	 * @readonly
	 */
	isUntitled: boolean;

	/**
	 * The identifier of the language associated with this document.
	 *
	 * @readonly
	 */
	languageId: string;

	/**
	 * The version number of this document (it will strictly increase after each
	 * change, including undo/redo).
	 *
	 * @readonly
	 */
	version: number;

	/**
	 * true if there are unpersisted changes.
	 *
	 * @readonly
	 */
	isDirty: boolean;

	/**
	 * Save the underlying file.
	 *
	 * @return A promise that will resolve to true when the file
	 * has been saved. If the file was not dirty or the save failed,
	 * will return false.
	 */
	save(): Thenable<boolean>;

	/**
	 * The number of lines in this document.
	 *
	 * @readonly
	 */
	lineCount: number;

	/**
	 * Returns a text line denoted by the line number. Note
	 * that the returned object is *not* live and changes to the
	 * document are not reflected.
	 *
	 * @param line A line number in [0, lineCount).
	 * @return A [line](#TextLine).
	 */
	lineAt(line: number): TextLine;

	/**
	 * Returns a text line denoted by the position. Note
	 * that the returned object is *not* live and changes to the
	 * document are not reflected.
	 *
	 * The position will be [adjusted](#TextDocument.validatePosition).
	 *
	 * @see [TextDocument.lineAt](#TextDocument.lineAt)
	 * @param position A position.
	 * @return A [line](#TextLine).
	 */
	lineAt(position: Position): TextLine;

	/**
	 * Converts the position to a zero-based offset.
	 *
	 * The position will be [adjusted](#TextDocument.validatePosition).
	 *
	 * @param position A position.
	 * @return A valid zero-based offset.
	 */
	offsetAt(position: Position): number;

	/**
	 * Converts a zero-based offset to a position.
	 *
	 * @param offset A zero-based offset.
	 * @return A valid [position](#Position).
	 */
	positionAt(offset: number): Position;

	/**
	 * Get the text of this document. A substring can be retrieved by providing
	 * a range. The range will be [adjusted](#TextDocument.validateRange).
	 *
	 * @param range Include only the text included by the range.
	 * @return The text inside the provided range or the entire text.
	 */
	getText(range?: Range): string;

	/**
	 * Get a word-range at the given position. By default words are defined by
	 * common separators, like space, -, _, etc. In addition, per languge custom
	 * [word definitions](#LanguageConfiguration.wordPattern) can be defined.
	 *
	 * The position will be [adjusted](#TextDocument.validatePosition).
	 *
	 * @param position A position.
	 * @return A range spanning a word, or `undefined`.
	 */
	getWordRangeAtPosition(position: Position): Range;

	/**
	 * Ensure a range is completely contained in this document.
	 *
	 * @param range A range.
	 * @return The given range or a new, adjusted range.
	 */
	validateRange(range: Range): Range;

	/**
	 * Ensure a position is contained in the range of this document.
	 *
	 * @param position A position.
	 * @return The given position or a new, adjusted position.
	 */
	validatePosition(position: Position): Position;
}

/**
	 * Represents a line of text, such as a line of source code.
	 *
	 * TextLine objects are __immutable__. When a [document](#TextDocument) changes,
	 * previously retrieved lines will not represent the latest state.
	 */
export interface TextLine {

	/**
	 * The zero-based line number.
	 *
	 * @readonly
	 */
	lineNumber: number;

	/**
	 * The text of this line without the line separator characters.
	 *
	 * @readonly
	 */
	text: string;

	/**
	 * The range this line covers without the line separator characters.
	 *
	 * @readonly
	 */
	range: Range;

	/**
	 * The range this line covers with the line separator characters.
	 *
	 * @readonly
	 */
	rangeIncludingLineBreak: Range;

	/**
	 * The offset of the first character which is not a whitespace character as defined
	 * by `/\s/`. **Note** that if a line is all whitespaces the length of the line is returned.
	 *
	 * @readonly
	 */
	firstNonWhitespaceCharacterIndex: number;

	/**
	 * Whether this line is whitespace only, shorthand
	 * for [TextLine.firstNonWhitespaceCharacterIndex](#TextLine.firstNonWhitespaceCharacterIndex]) === [TextLine.text.length](#TextLine.text.length).
	 *
	 * @readonly
	 */
	isEmptyOrWhitespace: boolean;
}



/**
 * An event describing an individual change in the text of a [document](#TextDocument).
 */
export interface TextDocumentContentChangeEvent {
	/**
	 * The range that got replaced.
	 */
	range: Range;
	/**
	 * The length of the range that got replaced.
	 */
	rangeLength: number;
	/**
	 * The new text for the range.
	 */
	text: string;
}

/**
 * An event describing a transactional [document](#TextDocument) change.
 */
export interface TextDocumentChangeEvent {

	/**
	 * The affected document.
	 */
	document: TextDocument;

	/**
	 * An array of content changes.
	 */
	contentChanges: TextDocumentContentChangeEvent[];
}

/**
	 * The definition of a symbol represented as one or many [locations](#Location).
	 * For most programming languages there is only one location at which a symbol is
	 * defined.
	 */
export type Definition = Location | Location[];



/**
 * Value-object describing what options formatting should use.
 */
export interface FormattingOptions {

	/**
	 * Size of a tab in spaces.
	 */
	tabSize: number;

	/**
	 * Prefer spaces over tabs.
	 */
	insertSpaces: boolean;

	/**
	 * Signature for further properties.
	 */
	[key: string]: boolean | number | string;
}


/**
 * Contains additional diagnostic information about the context in which
 * a [code action](#CodeActionProvider.provideCodeActions) is run.
 */
export interface CodeActionContext {

	/**
	 * An array of diagnostics.
	 *
	 * @readonly
	 */
	diagnostics: Diagnostic[];
}

/**
 * A cancellation token is passed to an asynchronous or long running
 * operation to request cancellation, like cancelling a request
 * for completion items because the user continued to type.
 *
 * To get an instance of a `CancellationToken` use a
 * [CancellationTokenSource](#CancellationTokenSource).
 */
export interface CancellationToken {

	/**
	 * Is `true` when the token has been cancelled, `false` otherwise.
	 */
	isCancellationRequested: boolean;

	/**
	 * An [event](#Event) which fires upon cancellation.
	 */
	onCancellationRequested: Event<any>;
}


/**
 * Represents a typed event.
 *
 * A function that represents an event to which you subscribe by calling it with
 * a listener function as argument.
 *
 * @sample `item.onDidChange(function(event) { console.log("Event happened: " + event); });`
 */
export interface Event<T> {

	/**
	 * A function that represents an event to which you subscribe by calling it with
	 * a listener function as argument.
	 *
	 * @param listener The listener function will be called when the event happens.
	 * @param thisArgs The `this`-argument which will be used when calling the event listener.
	 * @param disposables An array to which a [disposeable](#Disposable) will be added.
	 * @return A disposable which unsubscribes the event listener.
	 */
	(listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}



/**
 * A diagnostics collection is a container that manages a set of
 * [diagnostics](#Diagnostic). Diagnostics are always scopes to a
 * a diagnostics collection and a resource.
 *
 * To get an instance of a `DiagnosticCollection` use
 * [createDiagnosticCollection](#languages.createDiagnosticCollection).
 */
export interface DiagnosticCollection {

	/**
	 * The name of this diagnostic collection, for instance `typescript`. Every diagnostic
	 * from this collection will be associated with this name. Also, the task framework uses this
	 * name when defining [problem matchers](https://code.visualstudio.com/docs/editor/tasks#_defining-a-problem-matcher).
	 */
	name: string;

	/**
	 * Assign diagnostics for given resource. Will replace
	 * existing diagnostics for that resource.
	 *
	 * @param uri A resource identifier.
	 * @param diagnostics Array of diagnostics or `undefined`
	 */
	set(uri: Uri, diagnostics: Diagnostic[]): void;

	/**
	 * Replace all entries in this collection.
	 *
	 * Diagnostics of multiple tuples of the same uri will be merged, e.g
	 * `[[file1, [d1]], [file1, [d2]]]` is equivalent to `[[file1, [d1, d2]]]`.
	 * If a diagnostics item is `undefined` as in `[file1, undefined]`
	 * all previous but not subsequent diagnostics are removed.
	 *
	 * @param entries An array of tuples, like `[[file1, [d1, d2]], [file2, [d3, d4, d5]]]`, or `undefined`.
	 */
	set(entries: [Uri, Diagnostic[]][]): void;

	/**
	 * Remove all diagnostics from this collection that belong
	 * to the provided `uri`. The same as `#set(uri, undefined)`.
	 *
	 * @param uri A resource identifier.
	 */
	delete(uri: Uri): void;

	/**
	 * Remove all diagnostics from this collection. The same
	 * as calling `#set(undefined)`;
	 */
	clear(): void;

	/**
	 * Iterate over each entry in this collection.
	 *
	 * @param callback Function to execute for each entry.
	 * @param thisArg The `this` context used when invoking the handler function.
	 */
	forEach(callback: (uri: Uri, diagnostics: Diagnostic[], collection: DiagnosticCollection) => any, thisArg?: any): void;

	/**
	 * Get the diagnostics for a given resource. *Note* that you cannot
	 * modify the diagnostics-array returned from this call.
	 *
	 * @param uri A resource identifier.
	 * @returns An immutable array of [diagnostics](#Diagnostic) or `undefined`.
	 */
	get(uri: Uri): Diagnostic[];

	/**
	 * Check if this collection contains diagnostics for a
	 * given resource.
	 *
	 * @param uri A resource identifier.
	 * @returns `true` if this collection has diagnostic for the given resource.
	 */
	has(uri: Uri): boolean;

	/**
	 * Dispose and free associated resources. Calls
	 * [clear](#DiagnosticCollection.clear).
	 */
	dispose(): void;
}

/**
 * An output channel is a container for readonly textual information.
 *
 * To get an instance of an `OutputChannel` use
 * [createOutputChannel](#window.createOutputChannel).
 */
export interface OutputChannel {

	/**
	 * The human-readable name of this output channel.
	 * @readonly
	 */
	name: string;

	/**
	 * Append the given value to the channel.
	 *
	 * @param value A string, falsy values will not be printed.
	 */
	append(value: string): void;

	/**
	 * Append the given value and a line feed character
	 * to the channel.
	 *
	 * @param value A string, falsy values will be printed.
	 */
	appendLine(value: string): void;

	/**
	 * Removes all output from the channel.
	 */
	clear(): void;

	/**
	 * Reveal this channel in the UI.
	 *
	 * @deprecated This method is **deprecated** and the overload with
	 * just one parameter should be used (`show(preservceFocus?: boolean): void`).
	 *
	 * @param column This argument is **deprecated** and will be ignored.
	 * @param preserveFocus When `true` the channel will not take focus.
	 */
	show(column?: ViewColumn, preserveFocus?: boolean): void;

	/**
	 * Reveal this channel in the UI.
	 *
	 * @param preserveFocus When `true` the channel will not take focus.
	 */
	show(preservceFocus?: boolean): void;

	/**
	 * Hide this channel from the UI.
	 */
	hide(): void;

	/**
	 * Dispose and free associated resources.
	 */
	dispose(): void;
}



/**
 * A document filter denotes a document by different properties like
 * the [language](#TextDocument.languageId), the [scheme](#Uri.scheme) of
 * its resource, or a glob-pattern that is applied to the [path](#TextDocument.fileName).
 *
 * @sample A language filter that applies to typescript files on disk: `{ language: 'typescript', scheme: 'file' }`
 * @sample A language filter that applies to all package.json paths: `{ language: 'json', pattern: '**∕project.json' }`
 */
export interface DocumentFilter {

	/**
	 * A language id, like `typescript`.
	 */
	language?: string;

	/**
	 * A Uri [scheme](#Uri.scheme), like `file` or `untitled`.
	 */
	scheme?: string;

	/**
	 * A glob pattern, like `*.{ts,js}`.
	 */
	pattern?: string;
}

/**
 * A language selector is the combination of one or many language identifiers
 * and [language filters](#LanguageFilter).
 *
 * @sample `let sel:DocumentSelector = 'typescript'`;
 * @sample `let sel:DocumentSelector = ['typescript', { language: 'json', pattern: '**∕tsconfig.json' }]`;
 */
export type DocumentSelector = string | DocumentFilter | (string | DocumentFilter)[];
