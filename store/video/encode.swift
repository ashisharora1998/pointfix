// Encodes timestamped JPEG frames into an H.264 MP4 using AVFoundation, so the
// demo video needs no ffmpeg.  swift encode.swift frames.json out.mp4
import AVFoundation
import Foundation
import ImageIO

struct Frame: Decodable {
    let file: String
    let t: Double
}

let args = CommandLine.arguments
guard args.count == 3 else {
    print("usage: swift encode.swift frames.json out.mp4")
    exit(2)
}
let frames = try JSONDecoder().decode([Frame].self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let output = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: output)

func image(_ path: String) -> CGImage {
    let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(source, 0, nil)!
}

let first = image(frames[0].file)
let (width, height) = (first.width, first.height)

let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 6_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

var last = -1.0
for frame in frames {
    let t = max(frame.t, last + 0.001) // presentation times must increase
    last = t
    while !input.isReadyForMoreMediaData { usleep(1000) }
    var pixelBuffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixelBuffer)
    let buffer = pixelBuffer!
    CVPixelBufferLockBaseAddress(buffer, [])
    let context = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    context.draw(image(frame.file), in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(buffer, [])
    adaptor.append(buffer, withPresentationTime: CMTime(seconds: t, preferredTimescale: 600))
}

input.markAsFinished()
writer.endSession(atSourceTime: CMTime(seconds: last, preferredTimescale: 600))
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else {
    print("Encoding failed: \(String(describing: writer.error))")
    exit(1)
}
print("Wrote \(output.path): \(width)x\(height), \(frames.count) frames, \(String(format: "%.1f", last))s")
