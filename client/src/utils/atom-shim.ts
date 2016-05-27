import {TextDocument, Uri, TextLine, Range, Position} from './vscode-shim';
import TextBuffer from 'text-buffer';



export function convertToPosition(point: TextBuffer.Point) {
	return new Position(point.row, point.column)
}

export function convertFromPosition(position: Position) {
	return new TextBuffer.Point(position.line, position.character);
}

export function convertToRange(range: TextBuffer.Range) {
	const start = convertToPosition(range.start);
	const end = convertToPosition(range.end);
	return new Range(start, end);
}

export function convertFromRange(range: Range) {
	const start = convertFromPosition(range.start);
	const end = convertFromPosition(range.end);
	return new TextBuffer.Range(start, end);
}

const documents: { [uri: string]: AtomTextDocument; } = {};
export function createTextDocument(editor: Atom.TextEditor) {
	const uri = editor.getURI();
	const disposer = editor.onDidDestroy(() => {
		disposer.dispose();
		delete documents[uri];
	});
	documents[uri] = new AtomTextDocument(editor);
	return documents[uri];
}


export class AtomTextDocument implements TextDocument {
	constructor(private editor: Atom.TextEditor) {
		this.version = 1;
		const disposer = editor.onDidChange(() => this.version++);
		editor.onDidDestroy(() => disposer.dispose());
	}

	/**
	 * The associated URI for this document. Most documents have the __file__-scheme, indicating that they
	 * represent files on disk. However, some documents may have other schemes indicating that they are not
	 * available on disk.
	 *
	 * @readonly
	 */
	get uri() { return <Uri>Uri.parse(this.editor.getURI()); }

	/**
	 * The file system path of the associated resource. Shorthand
	 * notation for [TextDocument.uri.fsPath](#TextDocument.uri.fsPath). Independent of the uri scheme.
	 *
	 * @readonly
	 */
	get fileName() { return this.editor.getBuffer().getBaseName(); }

	/**
	 * Is this document representing an untitled file.
	 *
	 * @readonly
	 */
	get isUntitled() { return this.editor.isAlive(); }

	/**
	 * The identifier of the language associated with this document.
	 *
	 * @readonly
	 */
	get languageId() {
		let id = this.editor.getGrammar().name;
		console.log(id)
		return id;
	}

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
	get isDirty() { return this.editor.isModified(); }

	/**
	 * Save the underlying file.
	 *
	 * @return A promise that will resolve to true when the file
	 * has been saved. If the file was not dirty or the save failed,
	 * will return false.
	 */
	save(): Thenable<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			const disposer = this.editor.onDidSave(() => {
				disposer.dispose();
				resolve(true);
			});
			this.editor.save();
		});
	}

	/**
	 * The number of lines in this document.
	 *
	 * @readonly
	 */
	get lineCount() { return this.editor.getLineCount(); }

	/**
	 * Returns a text line denoted by the line number. Note
	 * that the returned object is *not* live and changes to the
	 * document are not reflected.
	 *
	 * @param line A line number in [0, lineCount).
	 * @return A [line](#TextLine).
	 */
	lineAt(lineOrPosition: number | Position): TextLine {
		let lineNumber: number;
		if (lineOrPosition instanceof Position) {
			lineNumber = lineOrPosition.line;
		} else if (typeof lineOrPosition === 'number') {
			lineNumber = lineOrPosition;
		}

		const text = <string><any>this.editor.getBuffer().lineForRow(lineNumber);
		const range = convertToRange(<TextBuffer.Range><any>this.editor.getBuffer().rangeForRow(lineNumber, false));
		const rangeIncludingLineBreak = convertToRange(<TextBuffer.Range><any>this.editor.getBuffer().rangeForRow(lineNumber, true));
		const firstNonWhitespaceCharacterIndex = /^(\s*)/.exec(text)[1].length;
		const isEmptyOrWhitespace = firstNonWhitespaceCharacterIndex === text.length;

		return {
			lineNumber,
			text,
			range,
			rangeIncludingLineBreak,
			firstNonWhitespaceCharacterIndex,
			isEmptyOrWhitespace
		};
	}

	/**
	 * Converts the position to a zero-based offset.
	 *
	 * The position will be [adjusted](#TextDocument.validatePosition).
	 *
	 * @param position A position.
	 * @return A valid zero-based offset.
	 */
	offsetAt(position: Position): number {
		return this.editor.getBuffer().characterIndexForPosition(convertFromPosition(position));
	}

	/**
	 * Converts a zero-based offset to a position.
	 *
	 * @param offset A zero-based offset.
	 * @return A valid [position](#Position).
	 */
	positionAt(offset: number): Position {
		return convertToPosition(this.editor.getBuffer().positionForCharacterIndex(offset));
	}

	/**
	 * Get the text of this document. A substring can be retrieved by providing
	 * a range. The range will be [adjusted](#TextDocument.validateRange).
	 *
	 * @param range Include only the text included by the range.
	 * @return The text inside the provided range or the entire text.
	 */
	getText(range?: Range): string {
		if (!range) return this.editor.getText();
		return <string><any>this.editor.getTextInRange(<any>convertFromRange(range));
	}

	/**
	 * Ensure a range is completely contained in this document.
	 *
	 * @param range A range.
	 * @return The given range or a new, adjusted range.
	 */
	validateRange(range: Range): Range {
		if (!(range instanceof Range)) {
			throw new Error('Invalid argument');
		}

		let start = this.validatePosition(range.start);
		let end = this.validatePosition(range.end);

		if (start === range.start && end === range.end) {
			return range;
		}
		return new Range(start.line, start.character, end.line, end.character);
	}


	/**
	 * Ensure a position is contained in the range of this document.
	 *
	 * @param position A position.
	 * @return The given position or a new, adjusted position.
	 */
	validatePosition(position: Position): Position {
		if (!(position instanceof Position)) {
			throw new Error('Invalid argument');
		}

		let {line, character} = position;
		let hasChanged = false;

		const lines = this.editor.getBuffer().getLines();

		if (line < 0) {
			line = 0;
			character = 0;
			hasChanged = true;
		}
		else if (line >= lines.length) {
			line = lines.length - 1;
			character = lines[line].length;
			hasChanged = true;
		}
		else {
			let maxCharacter = lines[line].length;
			if (character < 0) {
				character = 0;
				hasChanged = true;
			}
			else if (character > maxCharacter) {
				character = maxCharacter;
				hasChanged = true;
			}
		}

		if (!hasChanged) {
			return position;
		}
		return new Position(line, character);
	}

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
	getWordRangeAtPosition(_position: Position): Range {
		let position = this.validatePosition(_position);

		const atomPosition = convertFromPosition(position);

		let range: Range;

		// this may break things...
		const cursor = <Atom.Cursor><any>this.editor.addCursorAtBufferPosition(atomPosition);
		if (cursor.isInsideWord()) {
			const atomRange = <TextBuffer.Range><any>cursor.getCurrentWordBufferRange();
			range = convertToRange(atomRange);
		}
		cursor.destroy();
		return range;
	}
}
