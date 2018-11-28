const gulp = require('gulp'),
  nodemon = require('gulp-nodemon'),
  plumber = require('gulp-plumber'),
  livereload = require('gulp-livereload'),
  jshint = require('gulp-jshint'),
  gutil = require('gulp-util'),
  sass = require('gulp-sass'),
  fs = require('fs-extra');
const exec = require('child_process').exec;

const jsSrc = ['app.js', 'lib/**/*.js', 'app/**/*.js', './public/js/**/*.js'];

// Initialize required directories
gulp.task('init', (done) => {
  gutil.log('Synchronously creating required directories');
  fs.ensureDirSync('./public/');
  fs.ensureDirSync('./data/');
  fs.ensureDirSync('./logs/');
  fs.ensureDirSync('./etc/');
  fs.ensureDirSync('./etc/backup/');
  fs.ensureDirSync('./etc/backup/ssl/');
  fs.ensureDirSync('./resources/');
  
  // Add any other required directories here
  
  // Signal completion
  done();
});

// Lint Task
gulp.task('lint', (done) => {
  gulp.src(jsSrc)
    .pipe(jshint({ esversion: 6, node: true }))
    .pipe(jshint.reporter('default', {verbose: true}));

  // And also report file annotation counts
  exec('resources/counts.sh', (err, stdout, stderr) => {
    if (err) console.log("Couldn't run annotation counting script: ", err);
    console.log(stdout);
  });
  
  // Signal completion
  done();
});

gulp.task('sass', (done) => {
  gulp.src('./sass/style.scss')
    .pipe(plumber())
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest('./public/css'))
    .pipe(livereload());
  
  // Signal completion
  done();
});

gulp.task('watch', (done) => {
  gulp.watch('./sass/**/*.scss', gulp.series('sass'));
  gulp.watch(jsSrc, gulp.series('lint'));
  
  // Signal completion
  done();
});

gulp.task('develop', (done) => {
  livereload.listen();
  nodemon({
    script: 'app.js',
    ext: 'js njk',
    ignore: ['data/', 'dist/']
  }).on('restart', () => {
    setTimeout( () => {
      livereload.changed(__dirname);
    }, 500);
  });
  
  // Signal completion
  done();
});

gulp.task('default', gulp.series(
  'init',
  'lint',
  'sass',
  'develop',
  'watch'
));
