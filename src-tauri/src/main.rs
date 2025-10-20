// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample,SizedSample};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaChaRng;
use sha2::{Digest, Sha256};
use std::thread;
use once_cell::sync::Lazy;
use std::sync::{mpsc, Arc, RwLock};
use std::time::SystemTime;
use std::time::Duration;


static GLOBAL_SEED: Lazy<Arc<RwLock<Option<[u8; 32]>>>> =
    Lazy::new(|| Arc::new(RwLock::new(None)));

fn init_audio_seed() {
    // Clone the Arc to move it into the thread. This is the standard, safe way.
    let seed_arc = GLOBAL_SEED.clone();

    thread::spawn(move || {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .expect("Failed to get default input device");
        let mut supported_configs_range = device
            .supported_input_configs()
            .expect("error while querying configs");
        let supported_config = supported_configs_range
            .next()
            .expect("no supported config?!")
            .with_max_sample_rate();

        let (tx, rx) = mpsc::channel::<Vec<f32>>();

        let stream = match supported_config.sample_format() {
            cpal::SampleFormat::F32 => {
                build_input_stream::<f32>(&device, &supported_config.into(), tx)
            }
            cpal::SampleFormat::I16 => {
                build_input_stream::<i16>(&device, &supported_config.into(), tx)
            }
            cpal::SampleFormat::U16 => {
                build_input_stream::<u16>(&device, &supported_config.into(), tx)
            }
            _ => {
                // Fallback for any future/unknown sample formats; choose f32 as a safe default.
                build_input_stream::<f32>(&device, &supported_config.into(), tx)
            }
        };
        stream.play().unwrap();

        for data in rx {
            let mut hasher = Sha256::new();
            for sample in data {
                hasher.update(&sample.to_le_bytes());
            }

            hasher.update(rand::random::<[u8; 32]>());
            if let Ok(duration) = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) {
                hasher.update(&duration.as_nanos().to_le_bytes());
            }

            // Safely acquire a write lock and update the seed.
            let mut seed_guard = seed_arc.write().unwrap();
            *seed_guard = Some(hasher.finalize().into());
        }
    });
}


fn build_input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    tx: mpsc::Sender<Vec<f32>>,
) -> cpal::Stream
where
    T: Sample + SizedSample + Send + 'static,
{
    let err_fn = |err| eprintln!("❌ stream error: {}", err);

    let stream = device
        .build_input_stream::<T, _, _>(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                
                let samples_f32: Vec<f32> = data.iter().map(|s| s.to_float_sample().to_sample::<f32>()).collect();

                if let Err(e) = tx.send(samples_f32) {
                    eprintln!("⚠️ failed to send samples: {}", e);
                }
            },
            err_fn,
            None::<Duration>, 
        )
        .expect("💥 Failed to build input stream");

    stream
}



#[tauri::command]
fn generate_number(min: u32, max: u32) -> Result<u32, String> {
    if min > max {
        return Err("Min cannot be greater than Max".to_string());
    }
    let seed_guard = GLOBAL_SEED.read().unwrap();
    // Use the seed if it exists, otherwise fall back to a random seed.
    let seed = seed_guard.unwrap_or_else(rand::random);
    let mut rng = ChaChaRng::from_seed(seed);
    let range_size = (max as u64) - (min as u64) + 1;
    let use_special_probability = range_size <= 5;
    loop {
        let num = rng.gen_range(min..=max);
        if num == 35 || num == 26 {
            if use_special_probability {
                if rng.gen_range(1..=2*range_size) == 1 {
                    return Ok(num);
                }
            }
        } else {
            return Ok(num);
        }
    }
}

#[tauri::command]
fn random_number_normal(min: u32, max: u32) -> Result<u32,String> {
       if min > max {
        return Err("Min cannot be greater than Max".to_string());
    }
    let seed_guard = GLOBAL_SEED.read().unwrap();
    // Use the seed if it exists, otherwise fall back to a random seed.
    let seed = seed_guard.unwrap_or_else(|| rand::random());
    let mut rng = ChaChaRng::from_seed(seed);
    let num=rng.gen_range(min..=max);
    return Ok(num);
}
fn main() {
    init_audio_seed(); // Start seeding in the background

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![generate_number, random_number_normal])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
