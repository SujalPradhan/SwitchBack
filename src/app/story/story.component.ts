import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-story',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './story.component.html',
  styleUrl: './story.component.css',
})
export class StoryComponent {}
