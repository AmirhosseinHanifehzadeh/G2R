import * as vscode from 'vscode';


export function activate(context: vscode.ExtensionContext) {
	// Register the new command for showing the current Gherkin line
	const showGherkinLineDisposable = vscode.commands.registerCommand('GoGherkinRunner.runSingleScenario', (lineNumberFromLens?: number) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (document.languageId !== 'feature' && !document.fileName.endsWith('.feature')) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}

		const lineNumber = typeof lineNumberFromLens === 'number' ? lineNumberFromLens : editor.selection.active.line;
		const lineText = document.lineAt(lineNumber).text;
		if (lineText.includes('Scenario:')) {
			const processed = lineText.replace(/ /g, '_').toLowerCase();
			vscode.window.showInformationMessage(processed);
		} else {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}
		// Remove leading/trailing spaces and 'Scenario:' from the line
		let parsedScenario = lineText.trim();
		if (parsedScenario.startsWith('Scenario:')) {
			parsedScenario = parsedScenario.slice('Scenario:'.length).trim();
		}
		parsedScenario = parsedScenario.replace(/ /g, '_');

		// Find Test Function Name
		const fullPath = document.fileName;
		const pathParts = fullPath.split(/[/\\]/);
		let featureFilePath = pathParts.pop();
		let searchPath = pathParts.join('/');

		const fs = require('fs');
		const path = require('path');
		let foundGoFile = null;
		let foundGoFilePath = null;
		while (true) {
			// Check for .go files in currentDir
			const files = fs.readdirSync(searchPath);
			for (const file of files) {
				if (file.endsWith('.go')) {
					const goFilePath = path.join(searchPath, file);
					const content = fs.readFileSync(goFilePath, 'utf8');
					if (content.includes(featureFilePath)) {
						foundGoFile = file;
						foundGoFilePath = goFilePath;
						break;
					}
				}
			}

			if (foundGoFile) {
				break;
			}

			const lastDir = pathParts.pop();
			searchPath = pathParts.join('/');
			featureFilePath = lastDir + '/' + featureFilePath;

			if (lastDir === 'general-market') {
				break;
			}
		}

		let match: RegExpExecArray | null;
		let functionName: string = "";
		if (foundGoFile) {
			// Find all test function names in the found .go file
			const goFileContent = fs.readFileSync(foundGoFilePath, 'utf8');
			const testFuncRegex = /func\s+(Test\w+)\s*\(.*?\)\s*\{/;
			match = testFuncRegex.exec(goFileContent);
			if (match) {
				vscode.window.showInformationMessage(`Found .go file: ${foundGoFilePath} containing ${featureFilePath}. First test function: ${match[0]}`);
				functionName = match[1];
			} else {
				vscode.window.showInformationMessage(`Found .go file: ${foundGoFilePath} containing ${featureFilePath}, but no test functions found.`);
			}
		} else {
			vscode.window.showInformationMessage('No .go file containing the feature file path was found up to general-market directory.');
			return;
		}

		vscode.window.showInformationMessage(`searchPath: ${searchPath}`);

		// Pop pathParts until we arrive at 'service' directory
		let servicePathParts = [...pathParts];
		let lastDir = '';
		while (servicePathParts.length > 0) {
			lastDir = servicePathParts[servicePathParts.length - 1];
			if (lastDir === 'service') {
				break;
			}
			servicePathParts.pop();
		}
		const projectPath = servicePathParts.join('/');

		// Remove everything before and including "general-market" and set searchPath to "hs.ir"
		const generalMarketIndex = pathParts.indexOf('general-market');
		if (generalMarketIndex !== -1) {
			pathParts.splice(0, generalMarketIndex + 1);
			searchPath = "hs.ir" + "/" + pathParts.join('/');
		}

		const command = `/usr/local/go/bin/go test -timeout 30s -run ^${functionName}/${parsedScenario}$ ${searchPath} -benchmem -benchtime 1s -args -dotenv-dir ${projectPath}`;

		// Send the original lineText to the integrated terminal and press Enter
		let terminal = vscode.window.activeTerminal;
		if (!terminal) {
			terminal = vscode.window.createTerminal('GoGherkinRunner Terminal');
		}
		terminal.show();
		terminal.sendText(command, true); // true means send Enter after the text
	});

	context.subscriptions.push(showGherkinLineDisposable);

	// Register the new command for debugging the current Gherkin scenario
	const debugGherkinLineDisposable = vscode.commands.registerCommand('GoGherkinRunner.debugSingleScenario', async (lineNumberFromLens?: number) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (document.languageId !== 'feature' && !document.fileName.endsWith('.feature')) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}

		const lineNumber = typeof lineNumberFromLens === 'number' ? lineNumberFromLens : editor.selection.active.line;
		const lineText = document.lineAt(lineNumber).text;
		if (!lineText.includes('Scenario:')) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		// Remove leading/trailing spaces and 'Scenario:' from the line
		let parsedScenario = lineText.trim();
		if (parsedScenario.startsWith('Scenario:')) {
			parsedScenario = parsedScenario.slice('Scenario:'.length).trim();
		}
		parsedScenario = parsedScenario.replace(/ /g, '_');

		// Find Test Function Name (reuse logic from showGherkinLine)
		const fullPath = document.fileName;
		const pathParts = fullPath.split(/[/\\]/);
		let featureFilePath = pathParts.pop();
		let searchPath = pathParts.join('/');

		const fs = require('fs');
		const path = require('path');
		let foundGoFile = null;
		let foundGoFilePath = null;
		while (true) {
			const files = fs.readdirSync(searchPath);
			for (const file of files) {
				if (file.endsWith('.go')) {
					const goFilePath = path.join(searchPath, file);
					const content = fs.readFileSync(goFilePath, 'utf8');
					if (content.includes(featureFilePath)) {
						foundGoFile = file;
						foundGoFilePath = goFilePath;
						break;
					}
				}
			}
			if (foundGoFile) {
				break;
			}
			const lastDir = pathParts.pop();
			searchPath = pathParts.join('/');
			featureFilePath = lastDir + '/' + featureFilePath;
			if (lastDir === 'general-market') {
				break;
			}
		}

		let match = null;
		let functionName = '';
		if (foundGoFile) {
			const goFileContent = fs.readFileSync(foundGoFilePath, 'utf8');
			const testFuncRegex = /func\s+(Test\w+)\s*\(.*?\)\s*\{/;
			match = testFuncRegex.exec(goFileContent);
			if (match) {
				functionName = match[1];
			}
		}
		if (!functionName) {
			vscode.window.showInformationMessage('Could not find test function for this scenario.');
			return;
		}

		// Set the Go package directory (adjust as needed)
		const programPath = searchPath.startsWith('/') ? searchPath : '/' + searchPath;
		const cwdPath = programPath;

		// Pop pathParts until we arrive at 'service' directory
		let servicePathParts = [...pathParts];
		let lastDir = '';
		while (servicePathParts.length > 0) {
			lastDir = servicePathParts[servicePathParts.length - 1];
			if (lastDir === 'service') {
				break;
			}
			servicePathParts.pop();
		}
		const projectPath = '/' + servicePathParts.join('/');

		await vscode.debug.startDebugging(
			undefined,
			{
				name: 'Debug Go Scenario',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: programPath,
				args: [
					'-test.run',
					`^${functionName}/${parsedScenario}$`,
					'-dotenv-dir',
					projectPath,
				],
				cwd: cwdPath
			}
		);
	});
	context.subscriptions.push(debugGherkinLineDisposable);

	// Create a test controller for GoGherkinRunner
	const testController = vscode.tests.createTestController('GoGherkinRunnerTestController', 'GoGherkinRunner Tests');
	context.subscriptions.push(testController);


	// CodeLensProvider for Scenario lines
	class ScenarioCodeLensProvider implements vscode.CodeLensProvider {
		onDidChangeCodeLenses?: vscode.Event<void> | undefined;

		provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
			console.log('CodeLens provider called for', document.fileName, document.languageId);
			const codeLenses: vscode.CodeLens[] = [];
			let scenarioCount = 1;
			for (let i = 0; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				if (line.text.trim().startsWith('#')) {
					continue;
				}
				if (line.text.includes('Scenario:')) {
					const range = new vscode.Range(i, 0, i, line.text.length);
					codeLenses.push(new vscode.CodeLens(range, {
						title: `$(play)  Run test`,
						command: 'GoGherkinRunner.runSingleScenario',
						arguments: [i]
					}));
					codeLenses.push(new vscode.CodeLens(range, {
						title: `$(debug)  Debug (Scenario ${scenarioCount})`,
						command: 'GoGherkinRunner.debugSingleScenario',
						arguments: [i]
					}));
					scenarioCount++;
				}
			}
			return codeLenses;
		}
	}

	// Register the CodeLensProvider for .feature files
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			[
				{ language: 'feature', scheme: 'file' },
				{ language: 'gherkin', scheme: 'file' }
			],
			new ScenarioCodeLensProvider()
		)
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
