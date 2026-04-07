import { readdir, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const brailleXDots = 2;
const brailleYDots = 4;
const brailleBlank = 10240;

export interface BrailleFrameOptions {
	width: number;
	threshold: number;
	invert: boolean;
	maxChars: number;
}

export interface ExtractVideoFramesOptions {
	inputPath: string;
	outputDir: string;
	fps: number;
	maxFrames: number;
}

export async function extractVideoFrames( options: ExtractVideoFramesOptions ): Promise<string[]> {
	await mkdir( options.outputDir, { recursive: true } );

	await run( 'ffmpeg', [
		'-hide_banner',
		'-loglevel',
		'error',
		'-y',
		'-i',
		options.inputPath,
		'-vf',
		`fps=${options.fps}`,
		'-frames:v',
		options.maxFrames.toString(),
		join( options.outputDir, 'frame-%05d.png' ),
	] );

	const names = await readdir( options.outputDir );
	return names
		.filter( name => name.endsWith( '.png' ) )
		.sort()
		.map( name => join( options.outputDir, name ) );
}

export async function frameToBraille( input: Buffer | string, options: BrailleFrameOptions ): Promise<string> {
	const metadata = await sharp( input ).metadata();
	if ( !metadata.width || !metadata.height ) {
		throw new Error( 'Unable to read frame dimensions.' );
	}

	const size = fitBrailleSize( metadata.width, metadata.height, options.width, options.maxChars );
	const raw = await sharp( input )
		.resize( size.pixelWidth, size.pixelHeight, { fit: 'fill' } )
		.removeAlpha()
		.greyscale()
		.raw()
		.toBuffer();

	const pixels = ditherFloydSteinberg( raw, size.pixelWidth, size.pixelHeight, options.threshold );
	return pixelsToBraille( pixels, size.pixelWidth, size.pixelHeight, options.invert );
}

export async function cleanupDir( dir: string ) {
	await rm( dir, { recursive: true, force: true } );
}

function fitBrailleSize( sourceWidth: number, sourceHeight: number, requestedWidth: number, maxChars: number ) {
	const aspect = sourceHeight / sourceWidth;
	let width = Math.max( 1, Math.floor( requestedWidth ) );
	let height = brailleHeightForWidth( width, aspect );

	while ( width > 1 && charCount( width, height ) > maxChars ) {
		width--;
		height = brailleHeightForWidth( width, aspect );
	}

	return {
		width,
		height,
		pixelWidth: width * brailleXDots,
		pixelHeight: height * brailleYDots,
	};
}

function brailleHeightForWidth( width: number, aspect: number ) {
	return Math.max( 1, Math.ceil( width * brailleXDots * aspect / brailleYDots ) );
}

function charCount( width: number, height: number ) {
	return width * height + Math.max( 0, height - 1 );
}

function ditherFloydSteinberg( input: Buffer, width: number, height: number, threshold: number ) {
	const working = Float32Array.from( input );
	const output = new Uint8Array( width * height );

	for ( let y = 0; y < height; y++ ) {
		for ( let x = 0; x < width; x++ ) {
			const offset = y * width + x;
			const oldValue = working[ offset ];
			const newValue = oldValue > threshold ? 255 : 0;
			const error = oldValue - newValue;
			output[ offset ] = newValue;

			diffuse( working, width, height, x + 1, y, error * 7 / 16 );
			diffuse( working, width, height, x - 1, y + 1, error * 3 / 16 );
			diffuse( working, width, height, x, y + 1, error * 5 / 16 );
			diffuse( working, width, height, x + 1, y + 1, error * 1 / 16 );
		}
	}

	return output;
}

function diffuse( pixels: Float32Array, width: number, height: number, x: number, y: number, error: number ) {
	if ( x < 0 || x >= width || y < 0 || y >= height ) return;
	const offset = y * width + x;
	pixels[ offset ] = Math.max( 0, Math.min( 255, pixels[ offset ] + error ) );
}

function pixelsToBraille( pixels: Uint8Array, width: number, height: number, invert: boolean ) {
	const lines: string[] = [];
	const targetValue = invert ? 255 : 0;

	for ( let y = 0; y < height; y += brailleYDots ) {
		const chars: number[] = [];

		for ( let x = 0; x < width; x += brailleXDots ) {
			chars.push(
				brailleBlank
				+ ( +( pixelAt( pixels, width, x + 1, y + 3 ) === targetValue ) << 7 )
				+ ( +( pixelAt( pixels, width, x, y + 3 ) === targetValue ) << 6 )
				+ ( +( pixelAt( pixels, width, x + 1, y + 2 ) === targetValue ) << 5 )
				+ ( +( pixelAt( pixels, width, x + 1, y + 1 ) === targetValue ) << 4 )
				+ ( +( pixelAt( pixels, width, x + 1, y ) === targetValue ) << 3 )
				+ ( +( pixelAt( pixels, width, x, y + 2 ) === targetValue ) << 2 )
				+ ( +( pixelAt( pixels, width, x, y + 1 ) === targetValue ) << 1 )
				+ ( +( pixelAt( pixels, width, x, y ) === targetValue ) << 0 )
			);
		}

		lines.push( String.fromCharCode( ...chars ) );
	}

	return lines.join( '\n' );
}

function pixelAt( pixels: Uint8Array, width: number, x: number, y: number ) {
	return pixels[ y * width + x ];
}

function run( command: string, args: string[] ) {
	return new Promise<void>( ( resolve, reject ) => {
		const child = spawn( command, args, { stdio: [ 'ignore', 'ignore', 'pipe' ] } );
		let stderr = '';

		child.stderr.on( 'data', chunk => {
			stderr += chunk.toString();
		} );

		child.on( 'error', reject );
		child.on( 'close', code => {
			if ( code === 0 ) {
				resolve();
				return;
			}

			reject( new Error( `${command} exited with code ${code}: ${stderr.trim()}` ) );
		} );
	} );
}
