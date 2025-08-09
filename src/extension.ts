import * as vscode from 'vscode';


export function activate(context: vscode.ExtensionContext) {
	// Register the new command for showing the current Gherkin line
	const validateDocument = (document: vscode.TextDocument) => {
		if (document.languageId !== 'feature' && !document.fileName.endsWith('.feature')) {
			return false;
		}
		return true;
	};

	const validateScenario = (lineText: string) => {
		if (!lineText.includes('Scenario:') || lineText.trim().startsWith('#')) {
			return false;
		}
		return true;
	};

	const parseScenario = (lineText: string) => {
		let result = lineText.trim();
		if (result.startsWith('Scenario:')) {
			result = result.slice('Scenario:'.length).trim();
			return result.replace(/ /g, '_');
		}

		if (result.startsWith('Scenario Outline:')) {
			result = result.slice('Scenario Outline:'.length).trim();
			return result.replace(/ /g, '_');
		}

		return null;
	};

	const findTestFunctionName = (testFilePath: string): string | null => {
		const fs = require('fs');
		const goFileContent = fs.readFileSync(testFilePath, 'utf8');
		const testFuncRegex = /func\s+(Test\w+)\s*\(.*?\)\s*\{/;

		const match = testFuncRegex.exec(goFileContent);
		if (match) {
			return match[1];
		}

		return null;
	};

	const findEnvPath = (fullPath: string): string | null => {
		const pathParts = fullPath.split(/[/\\]/);
		let servicePathParts = [...pathParts];
		let lastDir = '';
		while (servicePathParts.length > 0) {
			lastDir = servicePathParts[servicePathParts.length - 1];
			if (lastDir === 'service') {
				return servicePathParts.join('/');
			}
			servicePathParts.pop();
		}
		return null;
	};

	const findPackagePath = (searchPath: string): string | null => {
		const searchPathList = searchPath.split(/[/\\]/);
		const lastDir = searchPathList.pop();
		const generalMarketIndex = searchPathList.indexOf('general-market');
		if (generalMarketIndex !== -1) {
			searchPathList.splice(0, generalMarketIndex + 1);
			return "hs.ir/" + searchPathList.join('/');
		}
		return null;
	};

	const findGoTestFile = (document: vscode.TextDocument): { foundGoFile: string | null, foundGoFilePath: string | null } => {
		const fs = require('fs');
		const path = require('path');

		const fullPath = document.fileName;
		const pathParts = fullPath.split(/[/\\]/);
		let featureFilePath = pathParts.pop();
		let searchPath = pathParts.join('/');

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
		}
		return { foundGoFile, foundGoFilePath };
	};

	const RunSingleScenario = vscode.commands.registerCommand('GoGherkinRunner.runSingleScenario', (lineNumberFromLens?: number) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (!validateDocument(document)) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}

		const lineNumber = typeof lineNumberFromLens === 'number' ? lineNumberFromLens : editor.selection.active.line;
		const lineText = document.lineAt(lineNumber).text;
		if (!validateScenario(lineText)) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		const parsedScenario = parseScenario(lineText);
		if (!parsedScenario) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		// Find Test File
		const { foundGoFile, foundGoFilePath } = findGoTestFile(document);
		if (!foundGoFile || !foundGoFilePath) {
			vscode.window.showInformationMessage('No .go file containing the feature file path was found up to general-market directory.');
			return;
		}

		// Find Test Function Name
		let functionName = findTestFunctionName(foundGoFilePath);
		if (!functionName) {
			vscode.window.showInformationMessage(`Found .go file: ${foundGoFilePath}, but no test function found.`);
			return;
		}

		// find .env file
		const dotEnvPath = findEnvPath(foundGoFilePath);
		if (!dotEnvPath) {
			vscode.window.showInformationMessage('No .env file found.');
			return;
		}

		const packagePath = findPackagePath(foundGoFilePath);
		if (!packagePath) {
			vscode.window.showInformationMessage('No project path found.');
			return;
		}

		const command = `go test -timeout 30s -run ^${functionName}/${parsedScenario}$ ${packagePath} -benchmem -benchtime 1s -args -dotenv-dir ${dotEnvPath}`;

		// run command in terminal
		let terminal = vscode.window.activeTerminal;
		if (!terminal) {
			terminal = vscode.window.createTerminal('GoGherkinRunner Terminal');
		}
		terminal.show();
		terminal.sendText(command, true);
	});

	context.subscriptions.push(RunSingleScenario);

	// Register the new command for debugging the current Gherkin scenario
	const DebugSingleScenario = vscode.commands.registerCommand('GoGherkinRunner.debugSingleScenario', async (lineNumberFromLens?: number) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const document = editor.document;
		if (!validateDocument(document)) {
			vscode.window.showInformationMessage('This is not a .feature (Gherkin) file.');
			return;
		}

		const lineNumber = typeof lineNumberFromLens === 'number' ? lineNumberFromLens : editor.selection.active.line;
		const lineText = document.lineAt(lineNumber).text;
		if (!validateScenario(lineText)) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		const parsedScenario = parseScenario(lineText);
		if (!parsedScenario) {
			vscode.window.showInformationMessage('This is not a Scenario line.');
			return;
		}

		// Find Test File
		const { foundGoFile, foundGoFilePath } = findGoTestFile(document);
		if (!foundGoFile || !foundGoFilePath) {
			vscode.window.showInformationMessage('No .go file containing the feature file path was found up to general-market directory.');
			return;
		}

		// Find Test Function Name
		let functionName = findTestFunctionName(foundGoFilePath);
		if (!functionName) {
			vscode.window.showInformationMessage(`Found .go file: ${foundGoFilePath}, but no test function found.`);
			return;
		}

		// find .env file
		const dotEnvPath = findEnvPath(foundGoFilePath);
		if (!dotEnvPath) {
			vscode.window.showInformationMessage('No .env file found.');
			return;
		}

		const packagePath = findPackagePath(foundGoFilePath);
		if (!packagePath) {
			vscode.window.showInformationMessage('No project path found.');
			return;
		}

		await vscode.debug.startDebugging(
			undefined,
			{
				name: 'Debug Go Scenario',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: packagePath,
				args: [
					'-test.run',
					`^${functionName}/${parsedScenario}$`,
					'-dotenv-dir',
					dotEnvPath,
				],
				cwd: packagePath,
			}
		);
	});
	context.subscriptions.push(DebugSingleScenario);

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
