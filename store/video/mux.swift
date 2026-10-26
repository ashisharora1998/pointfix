// Lays the voice-over clips onto the silent demo video at their start times,
// using AVFoundation.  swift mux.swift silent.mp4 voice.json out.mp4
import AVFoundation
import Foundation

struct Line: Decodable {
    let file: String
    let start: Double
}

let args = CommandLine.arguments
guard args.count == 4 else {
    print("usage: swift mux.swift silent.mp4 voice.json out.mp4")
    exit(2)
}
let lines = try JSONDecoder().decode([Line].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let output = URL(fileURLWithPath: args[3])
try? FileManager.default.removeItem(at: output)

let video = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let duration = try await video.load(.duration)
let composition = AVMutableComposition()

let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try videoTrack.insertTimeRange(
    CMTimeRange(start: .zero, duration: duration), of: try await video.loadTracks(withMediaType: .video)[0], at: .zero)

let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
for line in lines.sorted(by: { $0.start < $1.start }) {
    let clip = AVURLAsset(url: URL(fileURLWithPath: line.file))
    let at = CMTime(seconds: line.start, preferredTimescale: 600)
    let length = CMTimeMinimum(try await clip.load(.duration), duration - at) // never past the video's end
    guard length > .zero else { continue }
    try audioTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: length), of: try await clip.loadTracks(withMediaType: .audio)[0], at: at)
}

guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    print("Could not create the export session")
    exit(1)
}
try await export.export(to: output, as: .mp4)
print("Wrote \(output.path) with \(lines.count) voice-over lines, \(String(format: "%.1f", duration.seconds))s")
